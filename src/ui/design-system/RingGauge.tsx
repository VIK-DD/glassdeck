import { clamp } from '../../core';
import { cx } from './cx';
import styles from './RingGauge.module.css';

export type GaugeTone = 'normal' | 'warning' | 'critical';

interface RingGaugeProps {
  /** 0–100 */
  percent: number;
  /** Big text in the middle; defaults to the rounded percentage. */
  value?: string;
  unit?: string;
  label: string;
  tone?: GaugeTone;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Apple Watch–style activity ring with the value in the centre. */
export function RingGauge({ percent, value, unit = '%', label, tone = 'normal' }: RingGaugeProps) {
  const fraction = clamp(percent, 0, 100) / 100;
  return (
    <div className={cx(styles.gauge, styles[tone])} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} className={styles.track} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className={styles.value}
          strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className={styles.readout}>
        {value ?? Math.round(percent)}
        <span className={styles.unit}>{unit}</span>
      </span>
    </div>
  );
}
