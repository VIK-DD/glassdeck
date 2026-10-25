import type { ReactNode } from 'react';
import { GPU_HOT_C, HISTORY_LENGTH } from '../../core';
import { cx } from '../../ui/design-system/cx';
import { GlassPanel } from '../../ui/design-system/Glass';
import { Icon, type IconName } from '../../ui/design-system/Icon';
import { RingGauge } from '../../ui/design-system/RingGauge';
import { Sparkline } from '../../ui/design-system/Sparkline';
import { useDeckState } from '../DeckClientContext';
import styles from './pages.module.css';

const MB_PER_GB = 1024;
/** Fixed temperature scale for the chart, so the line means the same thing every time. */
const TEMP_CHART = { min: 30, max: 95 };

export function SystemPage() {
  const system = useDeckState((s) => s.system);
  const history = useDeckState((s) => s.systemHistory);
  const gpu = system?.gpu ?? null;
  const hot = gpu !== null && gpu.temperatureC >= GPU_HOT_C;

  return (
    <div className={styles.system}>
      <Tile icon="cpu" title="CPU" subtitle="All cores">
        <RingGauge percent={system?.cpuLoad ?? 0} label="CPU load" />
        <Sparkline values={history.cpu} min={0} max={100} capacity={HISTORY_LENGTH} />
      </Tile>
      <Tile icon="gauge" title="GPU" subtitle={gpu?.name ?? 'No NVIDIA GPU detected'}>
        <RingGauge percent={gpu?.load ?? 0} label="GPU load" />
        <Sparkline values={history.gpu} min={0} max={100} capacity={HISTORY_LENGTH} color="#bf5af2" />
      </Tile>
      <Tile icon="thermometer" title="GPU temperature" subtitle={hot ? 'Running hot' : 'Normal'} warn={hot}>
        <span className={cx(styles.bigValue, hot && styles.warn)}>
          {gpu ? gpu.temperatureC : '–'}
          <span className={styles.bigUnit}>°C</span>
        </span>
        <Sparkline
          values={history.gpuTemp}
          min={TEMP_CHART.min}
          max={TEMP_CHART.max}
          capacity={HISTORY_LENGTH}
          color={hot ? 'var(--color-warning)' : '#ff9f0a'}
        />
      </Tile>
      <Tile icon="memory" title="Memory" stacked>
        <Meter label="RAM" used={system?.memoryUsedMb ?? 0} total={system?.memoryTotalMb ?? 0} />
        <Meter label="VRAM" used={gpu?.memoryUsedMb ?? 0} total={gpu?.memoryTotalMb ?? 0} />
      </Tile>
    </div>
  );
}

interface TileProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  warn?: boolean;
  /** Stack the content vertically instead of gauge-plus-chart. */
  stacked?: boolean;
  children: ReactNode;
}

function Tile({ icon, title, subtitle, warn = false, stacked = false, children }: TileProps) {
  return (
    <GlassPanel className={styles.tile}>
      <div className={styles.tileHeader}>
        <span className={cx(styles.tileIcon, warn && styles.warn)}>
          <Icon name={icon} />
        </span>
        <span className={styles.tileTitles}>
          <span className={styles.tileTitle}>{title}</span>
          {subtitle && <span className={styles.tileSubtitle}>{subtitle}</span>}
        </span>
      </div>
      <div className={cx(styles.tileBody, stacked && styles.tileStacked)}>{children}</div>
    </GlassPanel>
  );
}

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  const fraction = total > 0 ? used / total : 0;
  return (
    <div className={styles.meter}>
      <div className={styles.meterText}>
        <span>{label}</span>
        <span className={styles.meterValue}>
          {total > 0 ? `${(used / MB_PER_GB).toFixed(1)} / ${(total / MB_PER_GB).toFixed(0)} GB` : '–'}
        </span>
      </div>
      <div className={styles.meterTrack} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
        <div className={styles.meterFill} style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}
