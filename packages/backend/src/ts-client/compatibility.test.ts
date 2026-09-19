import { describe, expect, it } from 'vitest';
import { keepFilesCompatibility } from './compatibility.js';
describe('TS6 keep-files restore compatibility', () => {
  it.each(['6.0.0-beta9', '6.0.0-beta12.1', 'v6.0.0-beta12'])('warns for %s', (v) => {
    expect(keepFilesCompatibility(v)).toBe(false);
  });
  it.each(['6.0.0-beta13', '6.0.0-beta13.1', '6.0.0-beta14 [Build: 123]', '6.0.0-rc1', '6.0.0', '6.1.0'])('recognizes %s', (v) => {
    expect(keepFilesCompatibility(v)).toBe(true);
  });
  it.each(['', 'unknown', '6.0.0-beta', '3.13.7'])('does not guess for %s', (v) => {
    expect(keepFilesCompatibility(v)).toBe(null);
  });
});
