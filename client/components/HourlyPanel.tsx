import type { HourlyPeriod, WeatherMeta } from '../../shared/types';
import { convertTempF, type TempUnit } from '../../shared/units';
import { WxIcon } from './WxIcon';
import { ForecastButton } from './ForecastButton';

interface HourlyPanelProps {
  hourly: HourlyPeriod[];
  meta: WeatherMeta | null;
  units: TempUnit;
  onOpenForecastToday: () => void;
  forecastButtonDisabled: boolean;
}

const SVG_WIDTH = 720;
const SVG_HEIGHT = 110;
const Y_TOP = 20;
const Y_BOTTOM = 90;

function computeChartPoints(
  hourly: HourlyPeriod[],
  units: TempUnit,
): {
  points: Array<{ x: number; y: number; temp: number }>;
  minTemp: number;
  maxTemp: number;
} {
  const temps = hourly.map((h) => convertTempF(h.tempF, units));
  const minTemp = Math.floor(Math.min(...temps) / 2) * 2;
  const maxTemp = Math.ceil(Math.max(...temps) / 2) * 2;
  const range = Math.max(1, maxTemp - minTemp);

  const columnWidth = SVG_WIDTH / hourly.length;
  const yScale = Y_BOTTOM - Y_TOP;

  const points = hourly.map((h, i) => {
    const t = convertTempF(h.tempF, units);
    return {
      x: (i + 0.5) * columnWidth,
      y: Y_TOP + ((maxTemp - t) / range) * yScale,
      temp: t,
    };
  });

  return { points, minTemp, maxTemp };
}

function precipBarClass(pct: number): string {
  if (pct > 50) return 'bar high';
  if (pct > 25) return 'bar med';
  return 'bar low';
}

export function HourlyPanel({ hourly, meta, units, onOpenForecastToday, forecastButtonDisabled }: HourlyPanelProps) {
  if (hourly.length === 0) return null;
  const { points, minTemp, maxTemp } = computeChartPoints(hourly, units);
  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="hud-hourly-section">
      <div className="hud-section-label">
        <span>
          ■ HOURLY FORECAST &nbsp;·&nbsp; NEXT {hourly.length}H
          {meta && <>&nbsp;·&nbsp; {meta.forecastOffice} GRID {meta.gridX},{meta.gridY}</>}
          <ForecastButton onClick={onOpenForecastToday} disabled={forecastButtonDisabled} />
        </span>
        <span>RANGE {minTemp}° — {maxTemp}°{units}</span>
      </div>

      <div className="hourly-wrap">
        <div className="hourly-chart">
          <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="none">
            <line className="hl-midline" x1="0" y1={(Y_TOP + Y_BOTTOM) / 2} x2={SVG_WIDTH} y2={(Y_TOP + Y_BOTTOM) / 2} />
            <polyline className="hl-line" points={polylinePoints} />
            {points.map((p, i) => (
              <circle key={`pt-${i}`} className="hl-point" cx={p.x} cy={p.y} r="3.5" />
            ))}
            {points.map((p, i) => (
              <text key={`lbl-${i}`} className="hl-temp-label" x={p.x} y={p.y - 10}>
                {Math.round(p.temp)}
              </text>
            ))}
          </svg>
        </div>

        <div className="hourly-icons">
          {hourly.map((h, i) => (
            <div key={`ic-${i}`} className="col">
              <WxIcon code={h.iconCode} size={26} />
            </div>
          ))}
        </div>

        <div className="hourly-precip">
          {hourly.map((h, i) => (
            <div key={`pc-${i}`} className="col">
              <div className={precipBarClass(h.precipProbPct)} style={{ height: `${h.precipProbPct}%` }}></div>
              {h.precipProbPct > 30 && <div className="pct">{h.precipProbPct}%</div>}
            </div>
          ))}
        </div>

        <div className="hourly-hours">
          {hourly.map((h, i) => (
            <div key={`hr-${i}`} className="col">{h.hourLabel}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
