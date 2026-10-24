import { describe, expect, it, vi } from 'vitest';
import { createPinGuard, MAX_PIN_ATTEMPTS, randomPin } from '../../electron/pinGuard';

function sequence(...pins: string[]) {
  let i = 0;
  return () => pins[i++];
}

describe('pin guard', () => {
  it('accepts the PIN once, then rotates it', () => {
    const onChange = vi.fn();
    const guard = createPinGuard(onChange, sequence('111111', '222222'));
    expect(guard.check('111111')).toBe('accepted');
    expect(guard.pin).toBe('222222');
    expect(onChange).toHaveBeenCalledWith('222222');
    expect(guard.check('111111')).toBe('rejected');
  });

  it('rotates the PIN after too many wrong guesses', () => {
    const guard = createPinGuard(() => {}, sequence('111111', '222222'));
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) expect(guard.check('000000')).toBe('rejected');
    expect(guard.check('000000')).toBe('reset');
    expect(guard.pin).toBe('222222');
    expect(guard.check('111111')).toBe('rejected');
  });

  it('generates six-digit PINs', () => {
    for (let i = 0; i < 50; i++) expect(randomPin()).toMatch(/^\d{6}$/);
  });
});
