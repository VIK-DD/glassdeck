// Reads and changes Windows audio: default output/mic volume and mute, per-app volume, and the default output device.
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Glassdeck.Helper;

internal sealed record OutputDevice(string Id, string Name, bool IsDefault);

internal sealed record VolumeState(double Volume, bool Muted);

/// <summary>One app's audio. Sessions of the same process are merged; <see cref="Id"/> is "system" or "pid:&lt;n&gt;".</summary>
internal sealed record AppAudio(string Id, string Name, string? Path, double Volume, bool Muted, bool Active);

internal sealed record AudioSnapshot(IReadOnlyList<OutputDevice> Outputs, VolumeState? Master, VolumeState? Mic, IReadOnlyList<AppAudio> Apps);

internal sealed class AudioController
{
    private const uint ClsctxAll = 0x17;
    private const string SystemSoundsId = "system";

    private readonly IMMDeviceEnumerator _enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
    private readonly Dictionary<uint, (string ProcessName, string Name, string? Path)> _processes = new();

    public AudioSnapshot Snapshot()
    {
        var output = DefaultDevice(EDataFlow.Render);
        var mic = DefaultDevice(EDataFlow.Capture);
        return new AudioSnapshot(
            Outputs(),
            output is null ? null : ReadEndpoint(output),
            mic is null ? null : ReadEndpoint(mic),
            output is null ? [] : Apps(output));
    }

    /// <summary>target: "master", "mic", "system" or "pid:&lt;n&gt;".</summary>
    public void SetVolume(string target, double volume)
    {
        var level = (float)Math.Clamp(volume, 0, 1);
        var context = Guid.Empty;
        switch (target)
        {
            case "master":
                WithEndpoint(EDataFlow.Render, endpoint => Check(endpoint.SetMasterVolumeLevelScalar(level, ref context)));
                break;
            case "mic":
                WithEndpoint(EDataFlow.Capture, endpoint => Check(endpoint.SetMasterVolumeLevelScalar(level, ref context)));
                break;
            default:
                ForEachSession(target, volume => Check(volume.SetMasterVolume(level, ref context)));
                break;
        }
    }

    public void SetMute(string target, bool muted)
    {
        var context = Guid.Empty;
        switch (target)
        {
            case "master":
                WithEndpoint(EDataFlow.Render, endpoint => Check(endpoint.SetMute(muted, ref context)));
                break;
            case "mic":
                WithEndpoint(EDataFlow.Capture, endpoint => Check(endpoint.SetMute(muted, ref context)));
                break;
            default:
                ForEachSession(target, volume => Check(volume.SetMute(muted, ref context)));
                break;
        }
    }

    /// <summary>Makes an active output device the default for every role (like the Sound control panel).</summary>
    public void SetOutput(string deviceId)
    {
        if (!Outputs().Any(device => device.Id == deviceId)) throw new ArgumentException("Unknown output device");
        var policy = (IPolicyConfig)new PolicyConfigComObject();
        foreach (var role in new[] { ERole.Console, ERole.Multimedia, ERole.Communications })
        {
            Check(policy.SetDefaultEndpoint(deviceId, role));
        }
    }

    private List<OutputDevice> Outputs()
    {
        var defaultId = DefaultDevice(EDataFlow.Render) is { } current && current.GetId(out var id) == 0 ? id : null;
        Check(_enumerator.EnumAudioEndpoints(EDataFlow.Render, DeviceState.Active, out var devices));
        Check(devices.GetCount(out var count));
        var outputs = new List<OutputDevice>();
        for (uint i = 0; i < count; i++)
        {
            if (devices.Item(i, out var device) != 0 || device.GetId(out var deviceId) != 0) continue;
            outputs.Add(new OutputDevice(deviceId, FriendlyName(device) ?? "Output", deviceId == defaultId));
        }
        return outputs;
    }

    private List<AppAudio> Apps(IMMDevice device)
    {
        var apps = new List<AppAudio>();
        foreach (var (session, volume) in Sessions(device))
        {
            Check(session.GetState(out var state));
            if (state == AudioSessionState.Expired) continue;
            Check(session.GetProcessId(out var pid));
            Check(volume.GetMasterVolume(out var level));
            Check(volume.GetMute(out var muted));
            var active = state == AudioSessionState.Active;

            string id, name;
            string? path;
            if (session.IsSystemSoundsSession() == 0)
            {
                (id, name, path) = (SystemSoundsId, "System sounds", null);
            }
            else if (DescribeProcess(pid) is { } info)
            {
                (id, name, path) = ($"pid:{pid}", info.Name, info.Path);
            }
            else
            {
                continue; // The process is gone; its session is just waiting to expire.
            }

            var index = apps.FindIndex(app => app.Id == id);
            if (index == -1) apps.Add(new AppAudio(id, name, path, Round(level), muted, active));
            else apps[index] = apps[index] with { Active = apps[index].Active || active, Muted = apps[index].Muted && muted };
        }
        return apps;
    }

    private void ForEachSession(string target, Action<ISimpleAudioVolume> action)
    {
        var device = DefaultDevice(EDataFlow.Render) ?? throw new InvalidOperationException("No output device");
        var matched = false;
        foreach (var (session, volume) in Sessions(device))
        {
            Check(session.GetProcessId(out var pid));
            var id = session.IsSystemSoundsSession() == 0 ? SystemSoundsId : $"pid:{pid}";
            if (id != target) continue;
            action(volume);
            matched = true;
        }
        if (!matched) throw new ArgumentException("Unknown app");
    }

    private static IEnumerable<(IAudioSessionControl2 Session, ISimpleAudioVolume Volume)> Sessions(IMMDevice device)
    {
        var manager = Activate<IAudioSessionManager2>(device);
        Check(manager.GetSessionEnumerator(out var sessions));
        Check(sessions.GetCount(out var count));
        for (var i = 0; i < count; i++)
        {
            if (sessions.GetSession(i, out var session) != 0) continue;
            yield return (session, (ISimpleAudioVolume)session);
        }
    }

    private (string Name, string? Path)? DescribeProcess(uint pid)
    {
        Process process;
        try
        {
            process = Process.GetProcessById((int)pid);
        }
        catch (ArgumentException)
        {
            _processes.Remove(pid);
            return null;
        }
        using (process)
        {
            // Cache by pid, re-checking the process name so a reused pid isn't mislabelled.
            if (_processes.TryGetValue(pid, out var cached) && cached.ProcessName == process.ProcessName)
            {
                return (cached.Name, cached.Path);
            }
            string? path = null;
            try
            {
                path = process.MainModule?.FileName;
            }
            catch (System.ComponentModel.Win32Exception)
            {
                // Elevated or protected process: no path, fall back to the process name.
            }
            var description = path is null ? null : FileVersionInfo.GetVersionInfo(path).FileDescription;
            var name = string.IsNullOrWhiteSpace(description) ? process.ProcessName : description.Trim();
            _processes[pid] = (process.ProcessName, name, path);
            return (name, path);
        }
    }

    private VolumeState? ReadEndpoint(IMMDevice device)
    {
        var endpoint = Activate<IAudioEndpointVolume>(device);
        if (endpoint.GetMasterVolumeLevelScalar(out var level) != 0 || endpoint.GetMute(out var muted) != 0) return null;
        return new VolumeState(Round(level), muted);
    }

    private void WithEndpoint(EDataFlow flow, Action<IAudioEndpointVolume> action)
    {
        var device = DefaultDevice(flow) ?? throw new InvalidOperationException("No default device");
        action(Activate<IAudioEndpointVolume>(device));
    }

    private IMMDevice? DefaultDevice(EDataFlow flow) =>
        _enumerator.GetDefaultAudioEndpoint(flow, ERole.Console, out var device) == 0 ? device : null;

    private static string? FriendlyName(IMMDevice device)
    {
        const uint StgmRead = 0;
        if (device.OpenPropertyStore(StgmRead, out var store) != 0) return null;
        var key = PropertyKey.DeviceFriendlyName;
        if (store.GetValue(ref key, out var value) != 0) return null;
        try
        {
            return value.AsString();
        }
        finally
        {
            Ole32.PropVariantClear(ref value);
        }
    }

    private static T Activate<T>(IMMDevice device)
    {
        var iid = typeof(T).GUID;
        Check(device.Activate(ref iid, ClsctxAll, IntPtr.Zero, out var result));
        return (T)result;
    }

    private static double Round(float value) => Math.Round(value, 2);

    private static void Check(int hresult)
    {
        if (hresult < 0) Marshal.ThrowExceptionForHR(hresult);
    }
}
