import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface TerminalModalProps {
  open: boolean;
  onClose: () => void;
  titleGlyph: string;
  titleText: string;
  titleRight: ReactNode;
  accentColor: string;
  children: ReactNode;
}

export function TerminalModal({
  open,
  onClose,
  titleGlyph,
  titleText,
  titleRight,
  accentColor,
  children,
}: TerminalModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayMouseDownRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const modalRef = useRef<HTMLDivElement>(null);

  // Keep the ref current on every render so the keydown handler always calls
  // the latest onClose without needing it in the main effect's dep array.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Trap Tab within the modal while open. Focus RESTORATION on close is
  // handled by the separate effect below (snapshot activeElement + restore
  // on cleanup). The two effects compose — don't reorder without checking.
  useFocusTrap(modalRef, open);

  useEffect(() => {
    if (!open) return;

    // Snapshot the element that had focus at open time so we can restore
    // it when the modal closes — keyboard users land back on the trigger
    // they pressed, not on document.body.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      // Guard against the trigger element having been removed from the DOM
      // (e.g. stale-alert cleanup unmounts the button before the modal closes).
      // Calling .focus() on a detached element silently no-ops to document.body;
      // document.contains() lets us skip that and fail gracefully.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Overlay click-to-close: require mousedown AND mouseup to both land on the
  // overlay itself. Prevents closing when a text-selection drag starts inside
  // the modal body and releases over the overlay.
  const onOverlayMouseDown = (e: React.MouseEvent) => {
    overlayMouseDownRef.current = e.target === e.currentTarget;
  };
  const onOverlayMouseUp = (e: React.MouseEvent) => {
    if (overlayMouseDownRef.current && e.target === e.currentTarget) {
      onClose();
    }
    overlayMouseDownRef.current = false;
  };

  const modalStyle = { '--terminal-modal-accent': accentColor } as CSSProperties;

  const content = (
    <div
      className="terminal-modal-overlay"
      onMouseDown={onOverlayMouseDown}
      onMouseUp={onOverlayMouseUp}
    >
      <div
        ref={modalRef}
        className="terminal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={modalStyle}
      >
        <div className="terminal-modal-titlebar">
          <div id={titleId} className="terminal-modal-title">
            {titleGlyph} {titleText}
          </div>
          <div className="terminal-modal-title-right">
            <span>{titleRight}</span>
            <button
              ref={closeRef}
              type="button"
              className="terminal-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="terminal-modal-body">{children}</div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
