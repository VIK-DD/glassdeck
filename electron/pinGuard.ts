// One-time pairing PIN. It rotates after every successful pairing and after too many wrong guesses,
// so a device on the network cannot brute-force it.
import { randomInt, timingSafeEqual } from 'node:crypto';

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;

export type PinCheck = 'accepted' | 'rejected' | 'reset';

export function randomPin(): string {
  return String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
}

export function createPinGuard(onChange: (pin: string) => void, generate: () => string = randomPin) {
  let pin = generate();
  let failures = 0;

  function rotate() {
    pin = generate();
    failures = 0;
    onChange(pin);
  }

  return {
    get pin() {
      return pin;
    },
    check(candidate: string): PinCheck {
      if (safeEqual(candidate, pin)) {
        rotate();
        return 'accepted';
      }
      failures += 1;
      if (failures >= MAX_PIN_ATTEMPTS) {
        rotate();
        return 'reset';
      }
      return 'rejected';
    },
    rotate,
  };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
