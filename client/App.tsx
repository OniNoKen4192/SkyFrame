import { useEffect, useState } from 'react';
import type { WeatherResponse } from '../shared/types';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';

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

      <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.5, fontSize: 11, letterSpacing: '0.22em' }}>
        {data ? '■ DATA LOADED · PANELS IN NEXT TASK' : '■ LOADING...'}
      </div>

      <Footer meta={data?.meta ?? null} error={error} />
    </div>
  );
}
