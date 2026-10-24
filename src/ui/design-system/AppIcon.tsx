import type { DeckTint } from '../../core';
import styles from './AppIcon.module.css';
import { cx } from './cx';

export type AppIconSize = 'sm' | 'md' | 'lg';

interface AppIconProps {
  tint: DeckTint;
  /** App name; its first letter stands in when there is no image. */
  label: string;
  /** The app's own icon (PNG data URL). */
  image?: string | null;
  /** sm 56 (sidebar), md 72 (phone home screen), lg 88. */
  size: AppIconSize;
  className?: string;
}

/** CarPlay-style app icon: rounded square with a gradient tint and the app's own icon on top. */
export function AppIcon({ tint, label, image, size, className }: AppIconProps) {
  return (
    <span className={cx(styles.icon, styles[tint], styles[size], className)} aria-hidden="true">
      {image ? (
        <img src={image} alt="" draggable={false} className={styles.image} />
      ) : (
        <span className={styles.letter}>{label.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

/** The tint's background, for colour pickers that should match the icons exactly. */
export function tintClassName(tint: DeckTint): string {
  return styles[tint];
}
