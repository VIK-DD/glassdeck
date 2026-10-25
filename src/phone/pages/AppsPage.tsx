import { useState, type UIEvent } from 'react';
import { paginate, type PublicDeckButton } from '../../core';
import { AppTile } from '../../ui/design-system/AppTile';
import { cx } from '../../ui/design-system/cx';
import { useDeckIntents, useDeckState } from '../DeckClientContext';
import { useElementSize } from '../hooks';
import styles from './pages.module.css';

/** Space one icon + label needs; the grid fits as many as the screen allows. */
const TILE_WIDTH = 112;
const TILE_HEIGHT = 120;
const TAP_VIBRATION_MS = 12;

/** Paged home-screen grid of app buttons; tapping one opens the app on the PC. */
export function AppsPage() {
  const buttons = useDeckState((s) => s.buttons);
  const launches = useDeckState((s) => s.launches);
  const online = useDeckState((s) => s.status === 'online');
  const { launch } = useDeckIntents();
  const [pagesRef, size, pagesElement] = useElementSize<HTMLDivElement>();
  const [page, setPage] = useState(0);

  const columns = Math.max(1, Math.floor(size.width / TILE_WIDTH));
  const rows = Math.max(1, Math.floor(size.height / TILE_HEIGHT));
  const pages = paginate(buttons, columns * rows);

  function press(button: PublicDeckButton) {
    navigator.vibrate?.(TAP_VIBRATION_MS);
    launch(button.id);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollLeft, clientWidth } = event.currentTarget;
    if (clientWidth > 0) setPage(Math.round(scrollLeft / clientWidth));
  }

  return (
    <div className={styles.apps}>
      <div ref={pagesRef} className={styles.appPages} onScroll={handleScroll}>
        {buttons.length === 0 && online && (
          <p className={styles.appsEmpty}>No apps yet. Add some in the Glassdeck window on your PC.</p>
        )}
        {buttons.length > 0 &&
          pages.map((items, index) => (
            <div
              key={index}
              className={styles.appPage}
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
              onClick={() => pagesElement?.scrollTo({ left: index * pagesElement.clientWidth, behavior: 'smooth' })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
