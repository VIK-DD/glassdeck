import type { ReactNode } from 'react';
import styles from './Card.module.css';
import { cx } from './cx';

interface CardProps {
  title?: string;
  /** Trailing header slot (e.g. a small button). */
  action?: ReactNode;
  /** Removes body padding, for edge-to-edge content like the map. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ title, action, flush = false, className, children }: CardProps) {
  return (
    <section className={cx(styles.card, flush && styles.flush, className)} aria-label={title}>
      {(title || action) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
