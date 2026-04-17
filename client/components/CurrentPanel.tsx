import type { CurrentConditions, Trend } from '../../shared/types';
import { WxIcon } from './WxIcon';

interface CurrentPanelProps {
  current: CurrentConditions;
}

function trendText(t: Trend): { arrow: string; rate: string; className: string } {
  if (t.confidence === 'missing') return { arrow: '', rate: '', className: 'steady' };
  if (t.direction === 'steady') return { arrow: '=', rate: 'steady', className: 'steady' };
  const arrow = t.direction === 'up' ? '▲' : '▼';
  const sign = t.deltaPerHour >= 0 ? '+' : '';
  const rate = `${sign}${t.deltaPerHour.toFixed(Math.abs(t.deltaPerHour) < 0.1 ? 2 : 1)}/h`;
  return { arrow, rate, className: '' };
}

// Fill percentages for the bar visualizations. These are scaled from the metric's
// typical display range to a 0-100% bar fill.
function fillPercent(metric: string, value: number): number {
  switch (metric) {
    case 'wind':       return Math.min(100, (value / 30) * 100);        // 0-30 mph scale
    case 'humidity':   return Math.min(100, value);                      // direct %
    case 'pressure':   return Math.min(100, Math.max(0, ((value - 29.50) / 1.00) * 100)); // 29.50-30.50
    case 'visibility': return Math.min(100, (value / 10) * 100);         // 0-10 mi scale
    case 'dewpoint':   return Math.min(100, Math.max(0, ((value + 20) / 100) * 100));    // -20 to 80°F
    default:           return 50;
  }
}

export function CurrentPanel({ current }: CurrentPanelProps) {
  const tempTrend = trendText(current.trends.temp);

  return (
    <>
      <div className="hud-hero">
        <div className="hud-readout">
          <span className="corner tl"></span>
          <span className="corner tr"></span>
          <span className="corner bl"></span>
          <span className="corner br"></span>
          <div className="tag">TEMP / FEEL</div>
          <div className="temp">
            {Math.round(current.tempF)}
            <span className="unit">°F</span>
            <span className="feel">/ {Math.round(current.feelsLikeF)}</span>
            {tempTrend.arrow && (
              <span className="trend">{tempTrend.arrow} {tempTrend.rate}</span>
            )}
          </div>
          <div className="desc">
            {current.conditionText}
            <span className="sep">·</span>
            {current.precipOutlook}
            <span className="sep">·</span>
            <span className="suntime">↑ {current.sunrise} ↓ {current.sunset}</span>
          </div>
        </div>
        <div className="hud-hero-icon">
          <WxIcon code={current.iconCode} size={112} />
        </div>
      </div>

      <div className="bars">
        <BarRow label="WIND" value={`${current.wind.speedMph} ${current.wind.cardinal}`} fill={fillPercent('wind', current.wind.speedMph)} trend={current.trends.wind} />
        <BarRow label="HUM"  value={current.humidityPct != null ? `${current.humidityPct} %` : '--'} fill={fillPercent('humidity', current.humidityPct ?? 0)} trend={current.trends.humidity} />
        <BarRow label="PRES" value={current.pressureInHg != null ? `${current.pressureInHg.toFixed(2)} "` : '--'} fill={fillPercent('pressure', current.pressureInHg ?? 0)} trend={current.trends.pressure} />
        <BarRow label="VIS"  value={current.visibilityMi != null ? `${current.visibilityMi} MI` : '--'} fill={fillPercent('visibility', current.visibilityMi ?? 0)} trend={current.trends.visibility} />
        <BarRow label="DEW"  value={current.dewpointF != null ? `${Math.round(current.dewpointF)} °F` : '--'} fill={fillPercent('dewpoint', current.dewpointF ?? 0)} trend={current.trends.dewpoint} />
      </div>
    </>
  );
}

interface BarRowProps {
  label: string;
  value: string;
  fill: number;
  trend: Trend;
}

function BarRow({ label, value, fill, trend }: BarRowProps) {
  const t = trendText(trend);
  return (
    <>
      <div className="lbl">{label}</div>
      <div className="sb">
        <div className="sb-off"></div>
        <div className="sb-on" style={{ ['--fill' as string]: `${fill}%` } as React.CSSProperties}></div>
      </div>
      <div className="val">{value}</div>
      <div className={`trend ${t.className}`}>{t.arrow ? `${t.arrow} ${t.rate}` : t.rate}</div>
    </>
  );
}
