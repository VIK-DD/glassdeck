import { useEffect, useState } from 'react';
import { GPU_HOT_C, mediaPosition, type ObsInfo } from '../../core';
import { IconButton } from '../../ui/design-system/Button';
import { cx } from '../../ui/design-system/cx';
import { GlassPanel } from '../../ui/design-system/Glass';
import { GlassToggle, type ToggleTone } from '../../ui/design-system/GlassToggle';
import { Icon, type IconName } from '../../ui/design-system/Icon';
import type { ClipOutcome } from '../deckClient';
import { useDeckIntents, useDeckState } from '../DeckClientContext';
import { useNow } from '../hooks';
import styles from './pages.module.css';

const CLIP_FEEDBACK_MS = 1800;

/** Home page: what's playing, the two controls you reach for mid-game, and a glance at the PC. */
export function NowPage() {
  return (
    <div className={styles.now}>
      <NowPlaying />
      <div className={styles.nowSide}>
        <div className={styles.nowToggles}>
          <MicToggle />
          <ClipToggle />
        </div>
        <Glance />
      </div>
    </div>
  );
}

function NowPlaying() {
  const media = useDeckState((s) => s.media);
  const receivedAt = useDeckState((s) => s.mediaReceivedAt);
  const online = useDeckState((s) => s.status === 'online');
  const { media: run } = useDeckIntents();
  const now = useNow(1000, media?.isPlaying === true);

  if (!media) {
    return (
      <GlassPanel className={cx(styles.player, styles.playerEmpty)}>
        <span className={styles.emptyIcon}>
          <Icon name="now" />
        </span>
        <p className={styles.emptyTitle}>Nothing playing</p>
        <p className={styles.emptyText}>Play music on your PC — Spotify, YouTube, anything — and it shows up here.</p>
      </GlassPanel>
    );
  }

  const position = mediaPosition(media, receivedAt, now);
  const progress = position !== null && media.durationSec ? position / media.durationSec : null;

  return (
    <GlassPanel className={styles.player}>
      <div className={styles.track}>
        {media.artwork ? (
          <img className={styles.cover} src={media.artwork} alt={`${media.album || media.title} cover`} />
        ) : (
          <span className={cx(styles.cover, styles.coverEmpty)}>
            <Icon name="now" />
          </span>
        )}
        <div className={styles.trackText}>
          <span className={styles.trackTitle}>{media.title}</span>
          <span className={styles.trackArtist}>{media.artist || media.album}</span>
          {media.app && <span className={styles.trackApp}>{media.app}</span>}
        </div>
      </div>
      {progress !== null && position !== null && (
        <div className={styles.progress}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
          <div className={styles.progressTimes}>
            <span>{formatTime(position)}</span>
            <span>-{formatTime(media.durationSec! - position)}</span>
          </div>
        </div>
      )}
      <div className={styles.transport}>
        <IconButton icon="previous" label="Previous track" size="lg" disabled={!online} onClick={() => run('previous')} />
        <IconButton
          icon={media.isPlaying ? 'pause' : 'play'}
          label={media.isPlaying ? 'Pause' : 'Play'}
          size="xl"
          disabled={!online}
          onClick={() => run('toggle')}
        />
        <IconButton icon="next" label="Next track" size="lg" disabled={!online} onClick={() => run('next')} />
      </div>
    </GlassPanel>
  );
}

function MicToggle() {
  const mic = useDeckState((s) => s.audio?.mic ?? null);
  const online = useDeckState((s) => s.status === 'online');
  const { setMute } = useDeckIntents();

  if (!mic) return <GlassToggle icon="mic-off" label="Mic" detail="No microphone" disabled onPress={() => {}} />;
  return (
    <GlassToggle
      icon={mic.muted ? 'mic-off' : 'mic'}
      label="Mic"
      detail={mic.muted ? 'Muted' : 'On'}
      tone={mic.muted ? 'danger' : 'neutral'}
      pressed={mic.muted}
      disabled={!online}
      onPress={() => setMute('mic', !mic.muted)}
    />
  );
}

function ClipToggle() {
  const obs = useDeckState((s) => s.obs);
  const online = useDeckState((s) => s.status === 'online');
  const { saveClip } = useDeckIntents();
  const [outcome, setOutcome] = useState<ClipOutcome | null>(null);

  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), CLIP_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  const { detail, tone, icon } = clipPresentation(obs, outcome);
  return (
    <GlassToggle
      icon={icon}
      label={obs?.replayBuffer ? 'Save clip' : 'Clip'}
      detail={detail}
      tone={tone}
      disabled={!online || obs?.status !== 'connected'}
      onPress={async () => setOutcome(await saveClip())}
    />
  );
}

function clipPresentation(obs: ObsInfo | null, outcome: ClipOutcome | null): { detail: string; tone: ToggleTone; icon: IconName } {
  if (outcome === 'saved') return { detail: 'Saved', tone: 'accent', icon: 'checkmark' };
  if (outcome === 'started') return { detail: 'Replay buffer on', tone: 'accent', icon: 'checkmark' };
  if (outcome === 'failed') return { detail: 'Didn’t work', tone: 'danger', icon: 'alert' };
  if (!obs || obs.status === 'offline') return { detail: 'OBS isn’t running', tone: 'neutral', icon: 'clip' };
  if (obs.status === 'disabled') return { detail: 'Enable in OBS', tone: 'neutral', icon: 'clip' };
  return obs.replayBuffer
    ? { detail: 'Via OBS', tone: 'neutral', icon: 'clip' }
    : { detail: 'Tap to arm', tone: 'neutral', icon: 'clip' };
}

function Glance() {
  const system = useDeckState((s) => s.system);
  const gpu = system?.gpu ?? null;
  const hot = gpu !== null && gpu.temperatureC >= GPU_HOT_C;

  return (
    <GlassPanel className={styles.glance}>
      <GlanceItem icon="cpu" label="CPU" value={system ? `${Math.round(system.cpuLoad)}%` : '–'} />
      <GlanceItem icon="gauge" label="GPU" value={gpu ? `${Math.round(gpu.load)}%` : '–'} />
      <GlanceItem icon="thermometer" label="GPU temp" value={gpu ? `${gpu.temperatureC}°` : '–'} warn={hot} />
    </GlassPanel>
  );
}

function GlanceItem({ icon, label, value, warn = false }: { icon: IconName; label: string; value: string; warn?: boolean }) {
  return (
    <div className={cx(styles.glanceItem, warn && styles.warn)}>
      <span className={styles.glanceValue}>{value}</span>
      <span className={styles.glanceLabel}>
        <Icon name={icon} />
        {label}
      </span>
    </div>
  );
}

function formatTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
