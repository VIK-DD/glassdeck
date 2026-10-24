import type { DeckTint, LaunchStatus } from '../../core';
import { AppIcon, type AppIconSize } from './AppIcon';
import styles from './AppTile.module.css';
import { cx } from './cx';
import { Icon } from './Icon';

interface AppTileProps {
  title: string;
  tint: DeckTint;
  image?: string | null;
  size: AppIconSize;
  /** Launch feedback: pulsing while launching, a badge when done or failed. */
  status?: LaunchStatus;
  /** Selection ring, for editors. */
  selected?: boolean;
  disabled?: boolean;
  onPress(): void;
}

/** Home screen entry: app icon with its name underneath. */
export function AppTile({ title, tint, image, size, status, selected = false, disabled = false, onPress }: AppTileProps) {
  return (
    <button
      type="button"
      className={cx(styles.tile, selected && styles.selected, status && styles[status])}
      disabled={disabled}
      aria-busy={status === 'launching'}
      onClick={onPress}
    >
      <span className={styles.iconWrap}>
        <AppIcon tint={tint} label={title} image={image} size={size} className={styles.icon} />
        {status === 'done' && (
          <span className={cx(styles.badge, styles.badgeDone)}>
            <Icon name="checkmark" />
          </span>
        )}
        {status === 'failed' && (
          <span className={cx(styles.badge, styles.badgeFailed)} role="img" aria-label="Could not open">
            <Icon name="alert" />
          </span>
        )}
      </span>
      <span className={styles.title}>{title}</span>
    </button>
  );
}
