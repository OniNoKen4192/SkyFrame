import { useEffect, useState } from 'react';
import type { WeatherResponse } from '../shared/types';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';
import { CurrentPanel } from './components/CurrentPanel';
import { HourlyPanel } from './components/HourlyPanel';
import { OutlookPanel } from './components/OutlookPanel';

const REFRESH_INTERVAL_MS = 90 * 1000;

export default function App() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as WeatherResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };

    fetchWeather();
    const id = setInterval(fetchWeather, REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="hud-showcase">
      <TopBar />

      {data ? (
        <CurrentPanel current={data.current} />
      ) : (
        <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
          ■ LOADING...
        </div>
      )}

      {data && <HourlyPanel hourly={data.hourly} />}

      {data && <OutlookPanel daily={data.daily} />}

      <Footer meta={data?.meta ?? null} error={error} />
    </div>
  );
}
