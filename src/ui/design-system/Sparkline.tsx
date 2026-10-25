import { useId } from 'react';
import styles from './Sparkline.module.css';

interface SparklineProps {
  values: readonly number[];
  /** Fixed scale, so a quiet minute doesn't look like a busy one. */
  min: number;
  max: number;
  /** Number of samples the chart spans; fewer values are drawn from the right. */
  capacity: number;
  /** CSS colour, e.g. a token. */
  color?: string;
}

const WIDTH = 100;
const HEIGHT = 32;

/** Tiny area chart of recent samples. Decorative: the exact value is always shown next to it as text. */
export function Sparkline({ values, min, max, capacity, color = 'var(--color-accent)' }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return <div className={styles.sparkline} />;
  const step = WIDTH / Math.max(1, capacity - 1);
  const offset = WIDTH - (values.length - 1) * step;
  const points = values.map((value, i) => {
    const y = HEIGHT - ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * HEIGHT;
    return `${(offset + i * step).toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${WIDTH},${HEIGHT} L${offset.toFixed(1)},${HEIGHT} Z`;

  return (
    <svg className={styles.sparkline} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
