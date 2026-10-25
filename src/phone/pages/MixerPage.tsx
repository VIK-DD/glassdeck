import type { AudioTarget } from '../../core';
import { cx } from '../../ui/design-system/cx';
import { GlassPanel } from '../../ui/design-system/Glass';
import { Icon, type IconName } from '../../ui/design-system/Icon';
import { VolumeSlider } from '../../ui/design-system/VolumeSlider';
import { useDeckIntents, useDeckState } from '../DeckClientContext';
import styles from './pages.module.css';

/** Output device picker on top, one vertical slider per sound source below. */
export function MixerPage() {
  const audio = useDeckState((s) => s.audio);
  const { setOutput } = useDeckIntents();

  if (!audio) {
    return (
      <GlassPanel className={styles.unavailable}>
        <Icon name="mixer" />
        <p className={styles.emptyTitle}>Audio control isn’t available</p>
        <p className={styles.emptyText}>The Glassdeck helper isn’t running on the PC. Restart Glassdeck to try again.</p>
      </GlassPanel>
    );
  }

  return (
    <div className={styles.mixer}>
      <div className={styles.outputs} role="radiogroup" aria-label="Output device">
        {audio.outputs.map((output) => (
          <button
            key={output.id}
            type="button"
            role="radio"
            aria-checked={output.isDefault}
            className={cx(styles.output, output.isDefault && styles.outputActive)}
            onClick={() => !output.isDefault && setOutput(output.id)}
          >
            <Icon name="headphones" />
            <span>{output.name}</span>
          </button>
        ))}
      </div>
      <div className={styles.channels}>
        {audio.master && <Channel target="master" name="Output" icon="speaker" mutedIcon="speaker-off" {...audio.master} />}
        {audio.mic && <Channel target="mic" name="Mic" icon="mic" mutedIcon="mic-off" {...audio.mic} />}
        {audio.apps.map((app) => (
          <Channel
            key={app.id}
            target={app.id}
            name={app.name}
            volume={app.volume}
            muted={app.muted}
            image={app.icon}
            icon="speaker"
            mutedIcon="speaker-off"
          />
        ))}
      </div>
    </div>
  );
}

interface ChannelProps {
  target: AudioTarget;
  name: string;
  volume: number;
  muted: boolean;
  icon: IconName;
  mutedIcon: IconName;
  /** App icon; system channels use the glyph instead. */
  image?: string | null;
}

function Channel({ target, name, volume, muted, icon, mutedIcon, image }: ChannelProps) {
  const { setVolume, setMute } = useDeckIntents();
  return (
    <div className={styles.channel}>
      <div className={styles.channelSlider}>
        <VolumeSlider value={volume} muted={muted} label={`${name} volume`} onChange={(value) => setVolume(target, value)} />
      </div>
      <button
        type="button"
        className={cx(styles.channelMute, muted && styles.channelMuted)}
        aria-pressed={muted}
        aria-label={`${muted ? 'Unmute' : 'Mute'} ${name}`}
        onClick={() => setMute(target, !muted)}
      >
        {image ? <img src={image} alt="" draggable={false} /> : <Icon name={muted ? mutedIcon : icon} />}
        {image && muted && (
          <span className={styles.channelMutedBadge}>
            <Icon name={mutedIcon} />
          </span>
        )}
      </button>
      <span className={styles.channelName}>{name}</span>
    </div>
  );
}
