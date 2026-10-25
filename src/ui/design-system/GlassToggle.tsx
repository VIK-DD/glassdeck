import { cx } from './cx';
import styles from './GlassToggle.module.css';
import { Icon, type IconName } from './Icon';

export type ToggleTone = 'neutral' | 'accent' | 'danger';

interface GlassToggleProps {
  icon: IconName;
  label: string;
  /** Second line under the label, e.g. "On" / "Off" / "Saved". */
  detail?: string;
  /** Colour the glass takes when the control is "on" or needs attention. */
  tone?: ToggleTone;
  pressed?: boolean;
  disabled?: boolean;
  onPress(): void;
}

/** Big square Control Center–style button. When `tone` isn't neutral, the glass fills with that colour. */
export function GlassToggle({ icon, label, detail, tone = 'neutral', pressed, disabled = false, onPress }: GlassToggleProps) {
  return (
    <button
      type="button"
      className={cx(styles.toggle, styles[tone])}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onPress}
    >
      <span className={styles.iconBubble}>
        <Icon name={icon} />
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
    </button>
  );
}
