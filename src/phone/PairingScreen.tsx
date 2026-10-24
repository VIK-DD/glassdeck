import { useEffect, useState } from 'react';
import type { PairingFeedback } from '../core';
import { cx } from '../ui/design-system/cx';
import { PinPad } from '../ui/design-system/PinPad';
import { useDeckIntents, useDeckState } from './DeckClientContext';
import styles from './phone.module.css';

/** Must match PIN_LENGTH in electron/pinGuard.ts. */
const PIN_LENGTH = 6;

const FEEDBACK_TEXT: Record<PairingFeedback, string> = {
  'wrong-pin': 'Wrong PIN. Try again.',
  'pin-reset': 'Too many attempts. Use the new PIN shown on your PC.',
  unreachable: 'Can’t reach your PC. Check that both are on the same Wi-Fi.',
};

export function PairingScreen() {
  const pairing = useDeckState((s) => s.pairing);
  const feedback = useDeckState((s) => s.pairingFeedback);
  const { pair } = useDeckIntents();
  const [pin, setPin] = useState('');

  // Clear the entry after a rejected attempt so the next PIN starts fresh.
  useEffect(() => {
    if (feedback) setPin('');
  }, [feedback]);

  function addDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) pair(next);
  }

  return (
    <div className={styles.pairing}>
      <div className={styles.pairingText}>
        <h1 className={styles.pairingTitle}>Connect to your PC</h1>
        <p className={styles.pairingBody}>Enter the PIN shown in the Deck app on your PC.</p>
        <div className={styles.pinDots} role="status" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={cx(styles.pinDot, i < pin.length && styles.pinDotFilled)} />
          ))}
        </div>
        <p className={styles.pairingFeedback} role="alert">
          {feedback ? FEEDBACK_TEXT[feedback] : ''}
        </p>
      </div>
      <PinPad disabled={pairing} onDigit={addDigit} onDelete={() => setPin((value) => value.slice(0, -1))} />
    </div>
  );
}
