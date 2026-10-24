import { useMemo, useState, type UIEvent } from 'react';
import { paginate, recentButtons, type PublicDeckButton } from '../core';
import { AppIcon } from '../ui/design-system/AppIcon';
import { AppTile } from '../ui/design-system/AppTile';
import { cx } from '../ui/design-system/cx';
import { Dock, DockItem } from '../ui/design-system/Dock';
import { Icon } from '../ui/design-system/Icon';
import { useDeckIntents, useDeckState } from './DeckClientContext';
import { useClock, useElementSize, useFullscreen } from './hooks';
import styles from './phone.module.css';

/** Space one icon + label needs; the grid fits as many as the screen allows. */
const TILE_WIDTH = 112;
const TILE_HEIGHT = 120;
const TAP_VIBRATION_MS = 12;

/** CarPlay-style home screen: sidebar with recents, paged grid of app buttons on the wallpaper. */
export function DeckScreen() {
  const buttons = useDeckState((s) => s.buttons);
  const launches = useDeckState((s) => s.launches);
  const status = useDeckState((s) => s.status);
  const { launch } = useDeckIntents();
  const [pagesRef, size, pagesElement] = useElementSize<HTMLDivElement>();
  const [page, setPage] = useState(0);

  const columns = Math.max(1, Math.floor(size.width / TILE_WIDTH));
  const rows = Math.max(1, Math.floor(size.height / TILE_HEIGHT));
  const pages = paginate(buttons, columns * rows);
  const online = status === 'online';

  function press(button: PublicDeckButton) {
    navigator.vibrate?.(TAP_VIBRATION_MS);
    launch(button.id);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollLeft, clientWidth } = event.currentTarget;
    if (clientWidth > 0) setPage(Math.round(scrollLeft / clientWidth));
  }

  function showPage(index: number) {
    pagesElement?.scrollTo({ left: index * pagesElement.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className={styles.deck}>
      <Sidebar onPress={press} />
      <main className={styles.home}>
        {!online && (
          <div className={styles.banner} role="status">
            {status === 'offline' ? 'Reconnecting to your PC…' : 'Connecting…'}
          </div>
        )}
        <div ref={pagesRef} className={styles.pages} onScroll={handleScroll}>
          {buttons.length === 0 && online && (
            <p className={styles.empty}>No buttons yet. Add apps in the Deck window on your PC.</p>
          )}
          {buttons.length > 0 &&
            pages.map((items, index) => (
              <div
                key={index}
                className={styles.page}
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
              >
                {items.map((button) => (
                  <AppTile
                    key={button.id}
                    title={button.title}
                    tint={button.tint}
                    image={button.icon}
                    size="md"
                    status={launches[button.id]}
                    disabled={!online}
                    onPress={() => press(button)}
                  />
                ))}
              </div>
            ))}
        </div>
        {pages.length > 1 && (
          <div className={styles.dots}>
            {pages.map((_, index) => (
              <button
                key={index}
                type="button"
                className={cx(styles.dot, index === page && styles.dotActive)}
                aria-label={`Page ${index + 1} of ${pages.length}`}
                aria-current={index === page ? 'page' : undefined}
                onClick={() => showPage(index)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Sidebar({ onPress }: { onPress(button: PublicDeckButton): void }) {
  const time = useClock();
  const recentIds = useDeckState((s) => s.recentIds);
  const buttons = useDeckState((s) => s.buttons);
  const recents = useMemo(() => recentButtons({ recentIds, buttons }), [recentIds, buttons]);
  const online = useDeckState((s) => s.status === 'online');
  const fullscreen = useFullscreen();

  return (
    <Dock
      header={
        <>
          <span className={styles.time}>{time}</span>
          <span className={cx(styles.connection, online && styles.connectionOnline)}>
            <span className={styles.connectionDot} />
            {online ? 'PC' : 'Offline'}
          </span>
        </>
      }
      footer={
        fullscreen.supported && (
          <DockItem label={fullscreen.active ? 'Exit full screen' : 'Full screen'} onPress={fullscreen.toggle}>
            <span className={styles.sideButton}>
              <Icon name={fullscreen.active ? 'collapse' : 'expand'} />
            </span>
          </DockItem>
        )
      }
    >
      {recents.map((button) => (
        <DockItem key={button.id} label={button.title} onPress={() => onPress(button)}>
          <AppIcon tint={button.tint} label={button.title} image={button.icon} size="sm" />
        </DockItem>
      ))}
    </Dock>
  );
}
