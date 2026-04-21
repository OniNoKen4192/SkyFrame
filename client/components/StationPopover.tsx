import { useEffect, useRef, useState } from 'react';

export type StationOverrideMode = 'auto' | 'force-secondary';

interface StationSummary {
  stationId: string;
  observedAt: string | null;
  tempF: number | null;
  status: 'live' | 'stale' | 'error';
}

interface PreviewResponse {
  primary: StationSummary;
  fallback: StationSummary;
}

interface StationPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentMode: StationOverrideMode;
  primaryStationId: string;
  fallbackStationId: string;
  timezone: string | null;
  onChange: (mode: StationOverrideMode) => Promise<void>;
  onClose: () => void;
}

function formatObservedAt(iso: string | null, tz: string | null): string {
  if (!iso) return '--:--';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz ?? undefined,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.hour}:${map.minute}`;
}

export function StationPopover({
  anchorRef,
  currentMode,
  primaryStationId,
  fallbackStationId,
  timezone,
  onChange,
  onClose,
}: StationPopoverProps) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<StationOverrideMode>(currentMode);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Compute popover position from anchor on mount. Anchored above the Footer link.
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8,  // 8px gap above the link
    });
  }, [anchorRef]);

  // Fetch preview on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stations/preview')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: PreviewResponse) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc + outside-click dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const popover = popoverRef.current;
      const anchor = anchorRef.current;
      if (!popover) return;
      const target = e.target as Node;
      if (popover.contains(target)) return;
      if (anchor && anchor.contains(target)) return;  // clicking anchor is handled by Footer
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose, anchorRef]);

  const handleSelect = async (mode: StationOverrideMode) => {
    if (submitting || mode === selectedMode) return;
    setSelectedMode(mode);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onChange(mode);
      onClose();
    } catch (err) {
      setSelectedMode(currentMode);  // rollback
      setSubmitError((err as Error).message || 'Override failed');
      setSubmitting(false);
    }
  };

  const renderRow = (s: StationSummary) => (
    <div className="station-popover-row" data-status={s.status} key={s.stationId}>
      <span>{s.stationId}</span>
      <span>{formatObservedAt(s.observedAt, timezone)}</span>
      <span>{s.tempF != null ? `${s.tempF}°F` : '—'}</span>
      <span>({s.status})</span>
    </div>
  );

  if (!position) return null;

  return (
    <div
      ref={popoverRef}
      className="station-popover"
      data-override={currentMode === 'force-secondary' ? 'true' : 'false'}
      style={{ left: position.left, bottom: position.bottom }}
      role="dialog"
      aria-label="Station source"
    >
      <div className="station-popover-title">STATION SOURCE</div>

      <label className="station-popover-radio">
        <input
          type="radio"
          name="station-override"
          value="auto"
          checked={selectedMode === 'auto'}
          disabled={submitting}
          onChange={() => handleSelect('auto')}
        />
        {' '}AUTO — {primaryStationId}, fallback to {fallbackStationId}
      </label>

      <label className="station-popover-radio">
        <input
          type="radio"
          name="station-override"
          value="force-secondary"
          checked={selectedMode === 'force-secondary'}
          disabled={submitting}
          onChange={() => handleSelect('force-secondary')}
        />
        {' '}FORCE {fallbackStationId}
      </label>

      <div className="station-popover-divider">── PREVIEW ──</div>

      {previewError ? (
        <div className="station-popover-row" data-status="error">PREVIEW UNAVAILABLE</div>
      ) : preview ? (
        <>
          {renderRow(preview.primary)}
          {renderRow(preview.fallback)}
        </>
      ) : (
        <div className="station-popover-row" data-status="loading">
          <span>{primaryStationId}</span><span>--:--</span><span>—</span><span>(loading)</span>
        </div>
      )}

      {submitError && <div className="station-popover-error">▲ {submitError}</div>}
    </div>
  );
}
