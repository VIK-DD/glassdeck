// Fitness test: src/core is shared by Node (Electron host), the phone and the config window,
// so it must not depend on React, the UI, the DOM, Node or Electron.
import { expect, it } from 'vitest';

const coreSources = import.meta.glob('../src/core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

it('keeps src/core free of UI and platform dependencies', () => {
  const files = Object.entries(coreSources);
  expect(files.length).toBeGreaterThan(0);
  for (const [file, source] of files) {
    expect(source, file).not.toMatch(/from ['"](react|react-dom|electron)['"]/);
    expect(source, file).not.toMatch(/from ['"]node:/);
    expect(source, file).not.toMatch(/from ['"][./]*\/(ui|phone|config)\//);
    expect(source, file).not.toMatch(/\b(window|document|localStorage)\.|\bfetch\(/);
  }
});
