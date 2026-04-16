import { useEffect, useState } from 'react';
import type { WeatherResponse } from '../shared/types';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';
import { CurrentPanel } from './components/CurrentPanel';
import { HourlyPanel } from './components/HourlyPanel';
import { OutlookPanel } from './components/OutlookPanel';

export type ViewKey = 'current' | 'hourly' | 'outlook' | 'all';

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
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('current');

  useEffect(() => {
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

        // Schedule next poll based on the server's own expiration timestamp,
        // not a fixed client interval. This keeps the displayed "NEXT" time
        // honest and avoids the 2× TTL drift from timer jitter.
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
  }, []);

  const loadingPlaceholder = (
    <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
      ■ LOADING...
    </div>
  );

  const renderView = () => {
    if (!data) return loadingPlaceholder;
    switch (activeView) {
      case 'current': return <CurrentPanel current={data.current} />;
      case 'hourly':  return <HourlyPanel hourly={data.hourly} />;
      case 'outlook': return <OutlookPanel daily={data.daily} />;
      case 'all': return (
        <>
          <CurrentPanel current={data.current} />
          <HourlyPanel hourly={data.hourly} />
          <OutlookPanel daily={data.daily} />
        </>
      );
    }
  };

  return (
    <div className="hud-showcase">
      <TopBar
        stationId={data?.meta?.stationId ?? null}
        error={error}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {renderView()}

      <Footer meta={data?.meta ?? null} error={error} nextRetryAt={nextRetryAt} />
    </div>
  );
}
