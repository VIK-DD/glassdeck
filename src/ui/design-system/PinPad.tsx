import { Icon } from './Icon';
import styles from './PinPad.module.css';

interface PinPadProps {
  disabled?: boolean;
  onDigit(digit: string): void;
  onDelete(): void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** iOS passcode-style keypad. Avoids the system keyboard, which would cover a landscape screen. */
export function PinPad({ disabled = false, onDigit, onDelete }: PinPadProps) {
  return (
    <div className={styles.pad}>
      {DIGITS.map((digit) => (
        <button key={digit} type="button" className={styles.key} disabled={disabled} onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}
      <span />
      <button type="button" className={styles.key} disabled={disabled} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className={styles.deleteKey} disabled={disabled} aria-label="Delete" onClick={onDelete}>
        <Icon name="delete-left" />
      </button>
    </div>
  );
}
