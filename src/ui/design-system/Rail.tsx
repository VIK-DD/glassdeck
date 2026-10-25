import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './Rail.module.css';

interface RailProps {
  /** Status at the top (clock, connection). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Floating glass navigation rail on the left edge, CarPlay's sidebar in Liquid Glass. */
export function Rail({ header, footer, children }: RailProps) {
  return (
    <nav className={styles.rail} aria-label="Pages">
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.items}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  );
}

interface RailItemProps {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress(): void;
}

export function RailItem({ icon, label, active = false, onPress }: RailItemProps) {
  return (
    <button
      type="button"
      className={cx(styles.item, active && styles.active)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      <Icon name={icon} />
    </button>
  );
}
