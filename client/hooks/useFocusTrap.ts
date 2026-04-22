import { useEffect, type RefObject } from 'react';

// Selector matching elements that can receive focus. Excludes disabled
// controls and tabindex="-1" (which conventionally means "focusable by
// script but not in tab order"). The `a[href]` form deliberately excludes
// anchors without href — those aren't focusable in browsers either.
export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Traps Tab / Shift+Tab focus within the element referenced by `containerRef`
// while `active` is true. Assumes the modal is already present in the DOM
// and the caller handles initial focus / focus restoration separately —
// we only cycle inside the container.
//
// Why: The project's TerminalModal claims `aria-modal="true"` but previously
// let Tab escape to the underlying page. Assistive-tech users saw a modal
// contract the keyboard contract didn't honor.
export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('inert') && el.offsetParent !== null);

      if (focusables.length === 0) {
        // Nothing focusable inside — prevent Tab from escaping.
        e.preventDefault();
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Capture phase so we see Tab before any inner element's handler.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [containerRef, active]);
}
