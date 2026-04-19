import { useEffect, useState } from 'react';
import type { WeatherResponse, DailyPeriod } from '../shared/types';
import type { TempUnit } from '../shared/units';
import { AlertBanner } from './components/AlertBanner';
import { TerminalModal } from './components/TerminalModal';
import { AlertDetailBody } from './components/AlertDetailBody';
import { formatTime } from './alert-detail-format';
import { TIER_COLORS } from '../shared/alert-tiers';
import { LocationSetup } from './components/LocationSetup';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';
import { CurrentPanel } from './components/CurrentPanel';
import { HourlyPanel } from './components/HourlyPanel';
import { OutlookPanel } from './components/OutlookPanel';
import { ForecastBody } from './components/ForecastBody';
import {
  soundModeForTier,
  triggerAlertSound,
  cancelAllLoops,
  pruneSoundState,
} from './sound/alert-sounds';

export type ViewKey = 'current' | 'hourly' | 'outlook' | 'all';

export type ForecastTrigger =
  | { kind: 'today' }
  | { kind: 'day'; dateISO: string };

// Dismissed-alerts persistence. Lives at App level (not AlertBanner) so the
// root data-alert-tier and the banner always render from the same filtered
// list — otherwise dismissing the highest-tier alert would leave the UI
// painted in the dismissed alert's color while the banner shows a different,
// lower-tier alert.
const DISMISSED_KEY = 'skyframe.alerts.dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // Quota exceeded or storage unavailable — silently degrade.
  }
}

// Sound-acknowledged alerts persistence. Lives at App level alongside
// `dismissed` so the trigger effect and the banner's onClick handler
// see a single source of truth.
const SOUND_ACK_KEY = 'skyframe.alerts.soundAcknowledged';

function loadSoundAcked(): Set<string> {
  try {
    const raw = localStorage.getItem(SOUND_ACK_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveSoundAcked(set: Set<string>): void {
  try {
    localStorage.setItem(SOUND_ACK_KEY, JSON.stringify([...set]));
  } catch {
    // Quota exceeded or storage unavailable — silently degrade.
  }
}

// Temperature unit preference. Lives at App level alongside dismissed
// alerts so all child panels see one source of truth.
const UNITS_KEY = 'skyframe.units';

function loadUnits(): TempUnit {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    return raw === 'C' ? 'C' : 'F';
  } catch {
    return 'F';
  }
}

function saveUnits(unit: TempUnit): void {
  try {
    localStorage.setItem(UNITS_KEY, unit);
  } catch {
    // Quota exceeded or storage unavailable — silently degrade.
  }
}

// When the server's cache has expired and we need to retry, wait this long
// before the next poll. Also used as the fallback if the response didn't
// include a meta.nextRefreshAt we could parse.
const FALLBACK_REFRESH_MS = 90 * 1000;

// Buffer added to meta.nextRefreshAt so the client always polls *just after*
// the server-side cache expires, never just before. Prevents the off-by-one
// alignment bug where cache-hit polls push the effective refresh to 2× TTL.
const REFRESH_BUFFER_MS = 500;

// How long to wait before retrying after a network/server error.
const ERROR_RETRY_MS = 30 * 1000;

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('current');
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [soundAcked, setSoundAcked] = useState<Set<string>>(() => loadSoundAcked());
  const [units, setUnits] = useState<TempUnit>(() => loadUnits());
  const [detailAlertId, setDetailAlertId] = useState<string | null>(null);
  const [forecastTrigger, setForecastTrigger] = useState<ForecastTrigger | null>(null);

  // Check config status on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: { configured: boolean }) => {
        setConfigured(cfg.configured);
        if (!cfg.configured) setShowSetup(true);
      })
      .catch(() => setConfigured(false));
  }, []);

  // Poll weather data only when configured
  useEffect(() => {
    if (!configured) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = setTimeout(fetchWeather, Math.max(1000, delayMs));
    };

    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as WeatherResponse;
        if (cancelled) return;

        setData(json);
        setError(null);
        setNextRetryAt(null);

        const nextAt = Date.parse(json.meta.nextRefreshAt);
        const delay = Number.isFinite(nextAt)
          ? nextAt - Date.now() + REFRESH_BUFFER_MS
          : FALLBACK_REFRESH_MS;
        scheduleNext(delay);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setNextRetryAt(new Date(Date.now() + ERROR_RETRY_MS).toISOString());
        scheduleNext(ERROR_RETRY_MS);
      }
    };

    fetchWeather();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [configured]);

  const loadingPlaceholder = (
    <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
      ■ LOADING...
    </div>
  );

  const renderView = () => {
    if (!data) return loadingPlaceholder;
    const openToday = () => setForecastTrigger({ kind: 'today' });
    const openDay = (dateISO: string) => setForecastTrigger({ kind: 'day', dateISO });
    const forecastDisabled = (data.daily ?? []).length === 0;
    switch (activeView) {
      case 'current': return (
        <CurrentPanel
          current={data.current}
          units={units}
          onToggleUnits={toggleUnits}
          onOpenForecastToday={openToday}
          forecastButtonDisabled={forecastDisabled}
        />
      );
      case 'hourly':  return (
        <HourlyPanel
          hourly={data.hourly}
          units={units}
          onOpenForecastToday={openToday}
          forecastButtonDisabled={forecastDisabled}
        />
      );
      case 'outlook': return (
        <OutlookPanel daily={data.daily} units={units} onOpenForecastDay={openDay} />
      );
      case 'all': return (
        <>
          <CurrentPanel
            current={data.current}
            units={units}
            onToggleUnits={toggleUnits}
            onOpenForecastToday={openToday}
            forecastButtonDisabled={forecastDisabled}
          />
          <HourlyPanel
            hourly={data.hourly}
            units={units}
            onOpenForecastToday={openToday}
            forecastButtonDisabled={forecastDisabled}
          />
          <OutlookPanel daily={data.daily} units={units} onOpenForecastDay={openDay} />
        </>
      );
    }
  };

  const alerts = data?.alerts ?? [];
  const daily = data?.daily ?? [];

  // Prune dismissed ids to only those still in the active alerts list, so the
  // Set doesn't grow unbounded across days/weeks. Re-runs only when the active
  // id-set changes (the join('|') key collapses reference-equality churn).
  useEffect(() => {
    const activeIds = new Set(alerts.map((a) => a.id));

    // Prune dismissed
    let dismissedChanged = false;
    const prunedDismissed = new Set<string>();
    for (const id of dismissed) {
      if (activeIds.has(id)) prunedDismissed.add(id);
      else dismissedChanged = true;
    }
    if (dismissedChanged) {
      setDismissed(prunedDismissed);
      saveDismissed(prunedDismissed);
    }

    // Prune soundAcked
    let ackChanged = false;
    const prunedAck = new Set<string>();
    for (const id of soundAcked) {
      if (activeIds.has(id)) prunedAck.add(id);
      else ackChanged = true;
    }
    if (ackChanged) {
      setSoundAcked(prunedAck);
      saveSoundAcked(prunedAck);
    }

    // Prune module-internal state (sessionPlayedIds, cancel orphan loops)
    pruneSoundState(activeIds);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);

  // If the alert whose modal is open disappears from a later poll (expired
  // on the NWS side), close the modal rather than render a stale title.
  useEffect(() => {
    if (detailAlertId === null) return;
    if (!alerts.some((a) => a.id === detailAlertId)) {
      setDetailAlertId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|'), detailAlertId]);

  // Trigger alert sounds for any new qualifying alert (tornado-class or
  // severe-warning). Re-runs on alert id-list change. Session-dedup and
  // acknowledgment-checks live inside the sound module and the predicate
  // below, so repeated polls of the same alert don't re-fire the sound.
  useEffect(() => {
    for (const alert of alerts) {
      const mode = soundModeForTier(alert.tier);
      if (mode === 'silent') continue;
      if (soundAcked.has(alert.id)) continue;
      triggerAlertSound(alert.id, mode, ackSinglePlayed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.id).join('|')]);

  // Close the forecast modal if the day it points at falls off the
  // end of the window (e.g. next-day rollover) or if the daily list
  // empties entirely.
  //
  // Note on the 'today' kind: this intentionally does NOT close the
  // modal when daily[0] changes across a midnight rollover. "Today"
  // means "the current day 0" — if the dashboard stays open past
  // midnight, the modal body re-derives from the new daily[0] and
  // the title still truthfully reads TODAY. If we ever want the
  // modal to freeze at the click moment instead, capture the dateISO
  // into the trigger and treat 'today' the same as 'day'.
  useEffect(() => {
    if (forecastTrigger === null) return;
    if (forecastTrigger.kind === 'today' && daily.length === 0) {
      setForecastTrigger(null);
      return;
    }
    if (forecastTrigger.kind === 'day' && !daily.some((d) => d.dateISO === forecastTrigger.dateISO)) {
      setForecastTrigger(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.map((d) => d.dateISO).join('|'), forecastTrigger]);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const primaryTier = visible[0]?.tier;

  const dismissAlert = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  const acknowledgeAlertSounds = () => {
    const cancelled = cancelAllLoops();
    if (cancelled.length === 0) return;
    setSoundAcked((prev) => {
      const next = new Set(prev);
      for (const id of cancelled) next.add(id);
      saveSoundAcked(next);
      return next;
    });
  };

  const ackSinglePlayed = (id: string) => {
    setSoundAcked((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveSoundAcked(next);
      return next;
    });
  };

  const toggleUnits = () => {
    const next: TempUnit = units === 'F' ? 'C' : 'F';
    setUnits(next);
    saveUnits(next);
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setConfigured(true);
    setData(null);
  };

  const detailAlert = detailAlertId !== null
    ? alerts.find((a) => a.id === detailAlertId) ?? null
    : null;

  const detailIssuedLabel = detailAlert ? formatTime(detailAlert.issuedAt) : '';

  const forecastPeriod: DailyPeriod | null =
    forecastTrigger?.kind === 'today' ? (daily[0] ?? null) :
    forecastTrigger?.kind === 'day'   ? (daily.find((d) => d.dateISO === forecastTrigger.dateISO) ?? null) :
    null;

  const forecastTitleText = forecastTrigger?.kind === 'today'
    ? 'FORECAST · TODAY'
    : forecastPeriod
    ? `FORECAST · ${forecastPeriod.dayOfWeek.toUpperCase()} ${forecastPeriod.dateLabel.toUpperCase()}`
    : '';

  const forecastGeneratedLabel = data?.meta?.forecastGeneratedAt
    ? formatTime(data.meta.forecastGeneratedAt)
    : '';

  return (
    <div className="hud-showcase" data-alert-tier={primaryTier}>
      {showSetup && (
        <LocationSetup
          onComplete={handleSetupComplete}
          onCancel={configured ? () => setShowSetup(false) : undefined}
        />
      )}
      {visible.length > 0 && (
        <AlertBanner
          alerts={visible}
          onDismiss={dismissAlert}
          onOpenDetail={setDetailAlertId}
          onAcknowledgeSounds={acknowledgeAlertSounds}
        />
      )}
      <TerminalModal
        open={detailAlert !== null}
        onClose={() => setDetailAlertId(null)}
        titleGlyph="▲"
        titleText={detailAlert?.event.toUpperCase() ?? ''}
        titleRight={detailIssuedLabel}
        accentColor={detailAlert ? TIER_COLORS[detailAlert.tier].base : '#22d3ee'}
      >
        {detailAlert && <AlertDetailBody alert={detailAlert} />}
      </TerminalModal>
      <TerminalModal
        open={forecastPeriod !== null}
        onClose={() => setForecastTrigger(null)}
        titleGlyph="▶"
        titleText={forecastTitleText}
        titleRight={forecastGeneratedLabel}
        accentColor="#22d3ee"
      >
        {forecastPeriod && <ForecastBody period={forecastPeriod} />}
      </TerminalModal>
      <TopBar
        stationId={data?.meta?.stationId ?? null}
        error={error}
        locationName={data?.meta?.locationName ?? ''}
        activeView={activeView}
        onViewChange={setActiveView}
        onLocationClick={() => setShowSetup(true)}
      />

      {renderView()}

      <Footer meta={data?.meta ?? null} error={error} nextRetryAt={nextRetryAt} />
    </div>
  );
}
