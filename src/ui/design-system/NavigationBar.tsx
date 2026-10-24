import type { ReactNode } from 'react';
import styles from './NavigationBar.module.css';

interface NavigationBarProps {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

/** iOS navigation bar: centred title with optional buttons on either side. */
export function NavigationBar({ title, leading, trailing }: NavigationBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.leading}>{leading}</div>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.trailing}>{trailing}</div>
    </header>
  );
}
