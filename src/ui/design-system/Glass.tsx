import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Glass.module.css';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** A denser material, for content that sits on top of other glass. */
  strong?: boolean;
}

/** A surface made of Liquid Glass. Everything glassy in the UI is built on this material. */
export function GlassPanel({ strong = false, className, ...rest }: GlassPanelProps) {
  return <div className={cx(styles.glass, strong && styles.strong, className)} {...rest} />;
}
