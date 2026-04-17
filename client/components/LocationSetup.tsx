import { useState } from 'react';

interface LocationSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function LocationSetup({ onComplete, onCancel }: LocationSetupProps) {
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = location.trim().length > 0 && email.trim().includes('@') && !saving;

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
            Required by NWS for API access. Stored locally only — never sent to any server except weather.gov.
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
