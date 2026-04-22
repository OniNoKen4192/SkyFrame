import { describe, it, expect } from 'vitest';
import { FOCUSABLE_SELECTOR } from './useFocusTrap';

describe('FOCUSABLE_SELECTOR', () => {
  it('is a non-empty CSS selector string', () => {
    expect(typeof FOCUSABLE_SELECTOR).toBe('string');
    expect(FOCUSABLE_SELECTOR.length).toBeGreaterThan(0);
  });

  it('covers buttons, links with href, inputs, selects, textareas, and tabindex>=0', () => {
    // Sanity: each of the standard interactive elements must appear in the selector.
    expect(FOCUSABLE_SELECTOR).toMatch(/button/);
    expect(FOCUSABLE_SELECTOR).toMatch(/\[href\]|a\[/);
    expect(FOCUSABLE_SELECTOR).toMatch(/input/);
    expect(FOCUSABLE_SELECTOR).toMatch(/select/);
    expect(FOCUSABLE_SELECTOR).toMatch(/textarea/);
    expect(FOCUSABLE_SELECTOR).toMatch(/tabindex/);
  });

  it('excludes disabled controls and tabindex="-1"', () => {
    expect(FOCUSABLE_SELECTOR).toMatch(/:not\(\[disabled\]\)/);
    expect(FOCUSABLE_SELECTOR).toMatch(/tabindex="-1"/);
  });
});
