import { useState } from 'react';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const gpsAvailable =
  typeof window !== 'undefined' &&
  'geolocation' in navigator &&
  LOCALHOST_HOSTNAMES.has(window.location.hostname);

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Use ZIP code or enter coordinates manually.';
    case err.POSITION_UNAVAILABLE:
      return 'Could not determine your location. Try ZIP code or manual coordinates.';
    case err.TIMEOUT:
      return 'Location request timed out. Try again, or use ZIP/manual entry.';
    default:
      return 'Location lookup failed. Use ZIP code or enter coordinates manually.';
  }
}

interface LocationSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function LocationSetup({ onComplete, onCancel }: LocationSetupProps) {
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const canSubmit = location.trim().length > 0 && email.trim().includes('@') && !saving;

  const handleUseMyLocation = () => {
    setLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        setLocation(`${lat}, ${lon}`);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: location.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Setup failed.');
        setSaving(false);
        return;
      }
      onComplete();
    } catch {
      setError('Network error. Is the server running?');
      setSaving(false);
    }
  };

  return (
    <div className="setup-overlay">
      <div className="setup-modal">
        <span className="corner tl"></span>
        <span className="corner tr"></span>
        <span className="corner bl"></span>
        <span className="corner br"></span>
        <div className="setup-title">■ SKYFRAME SETUP</div>

        <label className="setup-label">
          LOCATION
          <input
            className="setup-input"
            type="text"
            placeholder="ZIP code or lat, lon"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            autoFocus
          />
          <span className="setup-hint">e.g. 60614 or 41.9219, -87.6490</span>
        </label>

        <button
          type="button"
          className="setup-btn setup-btn-gps"
          disabled={!gpsAvailable || locating}
          title={gpsAvailable ? undefined : 'GPS requires localhost (browsers block Geolocation over non-HTTPS origins)'}
          onClick={handleUseMyLocation}
        >
          {locating ? 'LOCATING...' : '⌖ USE MY LOCATION'}
        </button>

        {gpsError && <div className="setup-error">▲ {gpsError}</div>}

        <label className="setup-label">
          CONTACT EMAIL
          <input
            className="setup-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="setup-hint">
            Required by NWS for API access. Sent only to weather.gov — never shared with other services.
          </span>
        </label>

        {error && <div className="setup-error">▲ {error}</div>}

        <div className="setup-actions">
          {onCancel && (
            <button type="button" className="setup-btn" onClick={onCancel}>
              CANCEL
            </button>
          )}
          <button
            type="button"
            className="setup-btn setup-btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {saving ? 'RESOLVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
