import { useDeckState } from './DeckClientContext';
import { DeckScreen } from './DeckScreen';
import { PairingScreen } from './PairingScreen';
import styles from './phone.module.css';

/** The phone is always in dark appearance, like CarPlay in a car at night. */
export function PhoneApp() {
  const unpaired = useDeckState((s) => s.status === 'unpaired');
  return (
    <div className={styles.app} data-appearance="night">
      {unpaired ? <PairingScreen /> : <DeckScreen />}
    </div>
  );
}
