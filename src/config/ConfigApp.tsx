import { useState } from 'react';
import type { DeckState, HelperStatus, Integrations, ObsStatus } from '../core';
import { Ambient } from '../ui/design-system/Ambient';
import { AppTile } from '../ui/design-system/AppTile';
import { Button } from '../ui/design-system/Button';
import { Card } from '../ui/design-system/Card';
import { cx } from '../ui/design-system/cx';
import { NavigationBar } from '../ui/design-system/NavigationBar';
import { ButtonEditor } from './ButtonEditor';
import styles from './config.module.css';
import { deck, useDeckHostState, useSystemAppearance } from './deckHost';

export function ConfigApp() {
  const appearance = useSystemAppearance();
  const state = useDeckHostState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state?.buttons.find((button) => button.id === selectedId) ?? null;

  return (
    <div className={styles.window} data-appearance={appearance}>
      <Ambient />
      <NavigationBar title="Glassdeck" />
      {state && (
        <div className={styles.columns}>
          <div className={styles.sideColumn}>
            <PhonePanel state={state} />
            <IntegrationsPanel integrations={state.integrations} />
          </div>
          <Card
            title="Apps"
            action={
              <Button variant="primary" icon="plus" onClick={() => deck.addApps()}>
                Add apps
              </Button>
            }
          >
            {state.buttons.length === 0 ? (
              <p className={styles.empty}>
                No apps yet. Add programs, Start menu shortcuts or Steam games, and they appear on the phone.
              </p>
            ) : (
              <div className={styles.buttonsLayout}>
                <div className={styles.grid}>
                  {state.buttons.map((button) => (
                    <AppTile
                      key={button.id}
                      title={button.title}
                      tint={button.tint}
                      image={button.icon}
                      size="sm"
                      selected={button.id === selectedId}
                      onPress={() => setSelectedId(button.id === selectedId ? null : button.id)}
                    />
                  ))}
                </div>
                {selected && (
                  <ButtonEditor
                    key={selected.id}
                    button={selected}
                    isFirst={state.buttons[0].id === selected.id}
                    isLast={state.buttons[state.buttons.length - 1].id === selected.id}
                    onDone={() => setSelectedId(null)}
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function PhonePanel({ state }: { state: DeckState }) {
  const phones = state.connectedPhones;
  return (
    <Card title="Phone">
      <p className={styles.hint}>On the phone, open Chrome and go to</p>
      {state.phoneUrls.length > 0 ? (
        <ul className={cx(styles.urls, 'selectable')}>
          {state.phoneUrls.map((url) => (
            <li key={url}>{url}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.warning}>This PC isn’t connected to a network.</p>
      )}
      <p className={styles.hint}>then enter this PIN</p>
      <p className={cx(styles.pin, 'selectable')} aria-label={`PIN ${state.pin.split('').join(' ')}`}>
        {state.pin}
      </p>
      <StatusLine on={phones > 0}>
        {phones === 0 ? 'No phone connected' : phones === 1 ? '1 phone connected' : `${phones} phones connected`}
      </StatusLine>
      <div className={styles.spacer} />
      <Button onClick={() => deck.resetPairing()}>Reset pairing</Button>
      <p className={styles.footnote}>Disconnects every phone. Each one will need the new PIN.</p>
    </Card>
  );
}

const HELPER_TEXT: Record<HelperStatus, string> = {
  running: 'Media and audio control ready',
  starting: 'Starting media and audio control…',
  unavailable: 'Media and audio control unavailable (build it with npm run helper:build)',
};

const OBS_TEXT: Record<ObsStatus, string> = {
  connected: 'OBS connected',
  offline: 'OBS isn’t running',
  disabled: 'In OBS, turn on Tools → WebSocket Server Settings',
};

function IntegrationsPanel({ integrations }: { integrations: Integrations }) {
  return (
    <Card title="Integrations">
      <div className={styles.integrations}>
        <StatusLine on={integrations.helper === 'running'}>{HELPER_TEXT[integrations.helper]}</StatusLine>
        <StatusLine on={integrations.obs === 'connected'}>{OBS_TEXT[integrations.obs]}</StatusLine>
        <StatusLine on={integrations.gpu !== null}>{integrations.gpu ?? 'No NVIDIA GPU detected'}</StatusLine>
      </div>
    </Card>
  );
}

function StatusLine({ on, children }: { on: boolean; children: string }) {
  return (
    <p className={styles.status}>
      <span className={cx(styles.statusDot, on && styles.statusDotOn)} />
      {children}
    </p>
  );
}
