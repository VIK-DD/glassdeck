// Glassdeck helper: a small Windows process the Electron host talks to over stdio.
//   stdout: one JSON event per line   {"type":"audio","data":{…}}   {"type":"media","data":{…}|null}
//   stdin:  one JSON command per line {"cmd":"setVolume","target":"pid:42","volume":0.5}
// Exits when stdin closes, so it never outlives the host.
using System.Collections.Concurrent;
using System.Text.Json;
using Glassdeck.Helper;

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var audioInterval = TimeSpan.FromMilliseconds(300);
var mediaInterval = TimeSpan.FromSeconds(1);
var commands = new ConcurrentQueue<string>();

var audio = new AudioController();
var media = new MediaController();

var reader = new Thread(() =>
{
    while (Console.In.ReadLine() is { } line) commands.Enqueue(line);
    Environment.Exit(0);
}) { IsBackground = true };
reader.Start();

string? lastAudio = null;
string? lastMediaIdentity = null;
MediaSnapshot? lastMedia = null;
var nextAudio = DateTime.UtcNow;
var nextMedia = DateTime.UtcNow;

while (true)
{
    while (commands.TryDequeue(out var line))
    {
        try
        {
            Handle(line);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"command failed: {error.Message}");
        }
        // Report the effect of a command right away instead of waiting for the next poll.
        nextAudio = nextMedia = DateTime.UtcNow;
    }

    var now = DateTime.UtcNow;
    if (now >= nextAudio)
    {
        nextAudio = now + audioInterval;
        Try("audio", () =>
        {
            var snapshot = JsonSerializer.Serialize(audio.Snapshot(), json);
            if (snapshot == lastAudio) return;
            lastAudio = snapshot;
            Emit("audio", snapshot);
        });
    }
    if (now >= nextMedia)
    {
        nextMedia = now + mediaInterval;
        Try("media", () =>
        {
            var snapshot = media.Snapshot();
            if (!MediaChanged(lastMedia, snapshot)) return;
            lastMedia = snapshot;
            Emit("media", snapshot is null ? "null" : JsonSerializer.Serialize(snapshot, json));
        });
    }
    Thread.Sleep(40);
}

void Handle(string line)
{
    using var document = JsonDocument.Parse(line);
    var command = document.RootElement;
    switch (command.GetProperty("cmd").GetString())
    {
        case "media":
            media.Run(command.GetProperty("action").GetString()!);
            break;
        case "setVolume":
            audio.SetVolume(command.GetProperty("target").GetString()!, command.GetProperty("volume").GetDouble());
            break;
        case "setMute":
            audio.SetMute(command.GetProperty("target").GetString()!, command.GetProperty("muted").GetBoolean());
            break;
        case "setOutput":
            audio.SetOutput(command.GetProperty("deviceId").GetString()!);
            break;
        default:
            throw new ArgumentException("Unknown command");
    }
}

// Track, play state or duration changed, or the position jumped (seek) compared to where it should be.
bool MediaChanged(MediaSnapshot? previous, MediaSnapshot? current)
{
    var identity = current is null
        ? null
        : $"{current.Title}|{current.Artist}|{current.Album}|{current.App}|{current.IsPlaying}|{current.DurationSec}|{current.Artwork?.Length}";
    var changed = identity != lastMediaIdentity;
    lastMediaIdentity = identity;
    if (changed || previous?.PositionSec is null || current?.PositionSec is null) return changed;
    var expected = previous.PositionSec.Value + (previous.IsPlaying ? (current.TimestampMs - previous.TimestampMs) / 1000.0 : 0);
    return Math.Abs(current.PositionSec.Value - expected) > 2;
}

void Emit(string type, string data)
{
    Console.Out.Write($"{{\"type\":\"{type}\",\"data\":{data}}}\n");
    Console.Out.Flush();
}

void Try(string what, Action action)
{
    try
    {
        action();
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"{what} failed: {error.Message}");
    }
}
