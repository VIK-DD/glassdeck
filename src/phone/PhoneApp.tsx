import { useState, type ComponentType } from 'react';
import { Ambient } from '../ui/design-system/Ambient';
import { cx } from '../ui/design-system/cx';
import { Icon, type IconName } from '../ui/design-system/Icon';
import { Rail, RailItem } from '../ui/design-system/Rail';
import { useDeckState } from './DeckClientContext';
import { useClock, useFullscreen } from './hooks';
import { AppsPage } from './pages/AppsPage';
import { MixerPage } from './pages/MixerPage';
import { NowPage } from './pages/NowPage';
import { SystemPage } from './pages/SystemPage';
import { PairingScreen } from './PairingScreen';
import styles from './phone.module.css';

type PageId = 'now' | 'mixer' | 'system' | 'apps';

const PAGES: { id: PageId; label: string; icon: IconName; component: ComponentType }[] = [
  { id: 'now', label: 'Now', icon: 'now', component: NowPage },
  { id: 'mixer', label: 'Mixer', icon: 'mixer', component: MixerPage },
  { id: 'system', label: 'System', icon: 'gauge', component: SystemPage },
  { id: 'apps', label: 'Apps', icon: 'grid', component: AppsPage },
];

/** The phone is always in dark appearance: a calm, glanceable panel next to the monitors. */
export function PhoneApp() {
  const unpaired = useDeckState((s) => s.status === 'unpaired');
  const artwork = useDeckState((s) => s.media?.artwork ?? null);
  return (
    <div className={styles.app} data-appearance="night">
      <Ambient image={unpaired ? null : artwork} />
      {unpaired ? <PairingScreen /> : <Shell />}
    </div>
  );
}

function Shell() {
  const [pageId, setPageId] = useState<PageId>('now');
  const status = useDeckState((s) => s.status);
  const Page = PAGES.find((page) => page.id === pageId)!.component;

  return (
    <div className={styles.shell}>
      <Sidebar pageId={pageId} onSelect={setPageId} />
      <main className={styles.page}>
        {status !== 'online' && (
          <div className={styles.banner} role="status">
            {status === 'offline' ? 'Reconnecting to your PC…' : 'Connecting…'}
          </div>
        )}
        <Page />
      </main>
    </div>
  );
}

function Sidebar({ pageId, onSelect }: { pageId: PageId; onSelect(id: PageId): void }) {
  const time = useClock();
  const online = useDeckState((s) => s.status === 'online');
  const fullscreen = useFullscreen();

  return (
    <Rail
      header={
        <>
          <span className={styles.time}>{time}</span>
          <span className={cx(styles.connection, online && styles.connectionOnline)} role="status">
            <span className={styles.connectionDot} />
            {online ? 'PC' : 'Offline'}
          </span>
        </>
      }
      footer={
        fullscreen.supported && (
          <button
            type="button"
            className={styles.railButton}
            aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
            onClick={fullscreen.toggle}
          >
            <Icon name={fullscreen.active ? 'collapse' : 'expand'} />
          </button>
        )
      }
    >
      {PAGES.map((page) => (
        <RailItem key={page.id} icon={page.icon} label={page.label} active={page.id === pageId} onPress={() => onSelect(page.id)} />
      ))}
    </Rail>
  );
}
