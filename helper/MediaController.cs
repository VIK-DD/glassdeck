// Reads and controls the system "now playing" session (Spotify, browsers, media players…) via the
// Global System Media Transport Controls — the same source as the Windows volume flyout.
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace Glassdeck.Helper;

internal sealed record MediaSnapshot(
    string Title,
    string Artist,
    string Album,
    string App,
    bool IsPlaying,
    double? PositionSec,
    double? DurationSec,
    long TimestampMs,
    string? Artwork);

internal sealed class MediaController
{
    private const int MaxArtworkBytes = 384 * 1024;
    /// <summary>Some players report no timeline update time; never extrapolate across more than this.</summary>
    private static readonly TimeSpan MaxExtrapolation = TimeSpan.FromHours(6);

    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private string? _artworkKey;
    private string? _artwork;

    public MediaSnapshot? Snapshot()
    {
        var session = Manager().GetCurrentSession();
        if (session is null) return null;
        var properties = Wait(session.TryGetMediaPropertiesAsync().AsTask());
        if (string.IsNullOrWhiteSpace(properties.Title)) return null;

        var isPlaying = session.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
        var timeline = session.GetTimelineProperties();
        var now = DateTimeOffset.UtcNow;

        double? duration = (timeline.EndTime - timeline.StartTime).TotalSeconds;
        double? position = null;
        if (duration <= 0)
        {
            duration = null;
        }
        else
        {
            var elapsed = now - timeline.LastUpdatedTime;
            var extrapolate = isPlaying && elapsed > TimeSpan.Zero && elapsed < MaxExtrapolation;
            position = Math.Clamp((timeline.Position - timeline.StartTime + (extrapolate ? elapsed : TimeSpan.Zero)).TotalSeconds, 0, duration.Value);
        }

        var app = AppName(session.SourceAppUserModelId);
        var artworkKey = $"{app}|{properties.Title}|{properties.Artist}|{properties.AlbumTitle}";
        if (artworkKey != _artworkKey)
        {
            _artworkKey = artworkKey;
            _artwork = ReadArtwork(properties.Thumbnail);
        }

        return new MediaSnapshot(
            properties.Title.Trim(),
            properties.Artist?.Trim() ?? "",
            properties.AlbumTitle?.Trim() ?? "",
            app,
            isPlaying,
            position,
            duration,
            now.ToUnixTimeMilliseconds(),
            _artwork);
    }

    public void Run(string action)
    {
        var session = Manager().GetCurrentSession() ?? throw new InvalidOperationException("Nothing is playing");
        var task = action switch
        {
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            _ => throw new ArgumentException($"Unknown media action: {action}"),
        };
        Wait(task.AsTask());
    }

    private GlobalSystemMediaTransportControlsSessionManager Manager() =>
        _manager ??= Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask());

    /// <summary>"Spotify.exe" → "Spotify"; "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify".</summary>
    private static string AppName(string appUserModelId)
    {
        var name = appUserModelId.Contains('!') ? appUserModelId[(appUserModelId.LastIndexOf('!') + 1)..] : appUserModelId;
        return name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
    }

    /// <summary>Returns the cover as a PNG or JPEG data URL, or null when missing, too large or another format.</summary>
    private static string? ReadArtwork(IRandomAccessStreamReference? thumbnail)
    {
        if (thumbnail is null) return null;
        try
        {
            using var stream = Wait(thumbnail.OpenReadAsync().AsTask());
            if (stream.Size == 0 || stream.Size > MaxArtworkBytes) return null;
            using var input = stream.AsStreamForRead();
            using var memory = new MemoryStream();
            input.CopyTo(memory);
            var bytes = memory.ToArray();
            var type = bytes switch
            {
                [0x89, 0x50, 0x4E, 0x47, ..] => "image/png",
                [0xFF, 0xD8, ..] => "image/jpeg",
                _ => null,
            };
            return type is null ? null : $"data:{type};base64,{Convert.ToBase64String(bytes)}";
        }
        catch (Exception)
        {
            return null; // Artwork is optional; a broken thumbnail must not hide the track.
        }
    }

    private static T Wait<T>(Task<T> task) => task.GetAwaiter().GetResult();
}
