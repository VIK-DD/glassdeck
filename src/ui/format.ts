// 24-hour clock: fits the narrow sidebar without an AM/PM suffix.
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function formatClock(epochMs: number): string {
  return clockFormat.format(epochMs);
}
