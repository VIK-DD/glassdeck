import { cx } from './cx';
import styles from './Ambient.module.css';

interface AmbientProps {
  /** Image whose colours bleed into the background (e.g. album art). Falls back to the wallpaper. */
  image?: string | null;
}

/** Full-screen backdrop behind the glass: the wallpaper, optionally tinted by a heavily blurred image. */
export function Ambient({ image }: AmbientProps) {
  return (
    <div className={styles.ambient} aria-hidden="true">
      <div
        className={cx(styles.art, image && styles.artVisible)}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      />
      <div className={styles.scrim} />
    </div>
  );
}
