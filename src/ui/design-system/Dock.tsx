import type { ReactNode } from 'react';
import styles from './Dock.module.css';
import { cx } from './cx';

interface DockProps {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** CarPlay sidebar: status at the top, recent apps in the middle, home button at the bottom. */
export function Dock({ header, footer, children }: DockProps) {
  return (
    <nav className={styles.dock} aria-label="Main navigation">
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.items}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  );
}

interface DockItemProps {
  /** Accessible name; the sidebar shows icons only, as in CarPlay. */
  label: string;
  active?: boolean;
  onPress(): void;
  children: ReactNode;
}

export function DockItem({ label, active = false, onPress, children }: DockItemProps) {
  return (
    <button
      type="button"
      className={cx(styles.item, active && styles.active)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
