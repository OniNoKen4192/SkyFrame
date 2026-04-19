import type { DailyPeriod } from '../../shared/types';
import { convertTempF, type TempUnit } from '../../shared/units';
import { WxIcon } from './WxIcon';

interface OutlookPanelProps {
  daily: DailyPeriod[];
  units: TempUnit;
  onOpenForecastDay: (dateISO: string) => void;
}

function precipClass(pct: number): string {
  if (pct >= 50) return 'precip high';
  if (pct >= 26) return 'precip med';
  if (pct >= 10) return 'precip low';
  return 'precip zero';
}

export function OutlookPanel({ daily, units, onOpenForecastDay }: OutlookPanelProps) {
  if (daily.length === 0) return null;

  // Compute shared scale from all days' highs/lows in chosen unit
  const lows = daily.map((d) => convertTempF(d.lowF, units));
  const highs = daily.map((d) => convertTempF(d.highF, units));
  const scaleMin = Math.floor(Math.min(...lows) / 2) * 2;
  const scaleMax = Math.ceil(Math.max(...highs) / 2) * 2;
  const scaleRange = Math.max(1, scaleMax - scaleMin);

  const scalePoints = [
    scaleMin,
    Math.round(scaleMin + scaleRange * 0.25),
    Math.round(scaleMin + scaleRange * 0.5),
    Math.round(scaleMin + scaleRange * 0.75),
    scaleMax,
  ];

  return (
    <div className="hud-outlook-section">
      <div className="hud-section-label">
        <span>■ 7-DAY OUTLOOK &nbsp;·&nbsp; KMKE &nbsp;/&nbsp; MKX GRID 88,58 &nbsp;/&nbsp; WIZ066</span>
        <span>RANGE {scaleMin}° — {scaleMax}°{units}</span>
      </div>

      <div className="outlook-scale">
        <div></div><div></div><div></div>
        <div className="scale-axis">
          {scalePoints.map((n) => <span key={n}>{n}°</span>)}
        </div>
        <div></div>
      </div>

      <div className="outlook">
        {daily.map((day) => {
          const lo = convertTempF(day.lowF, units);
          const hi = convertTempF(day.highF, units);
          const leftPct = ((lo - scaleMin) / scaleRange) * 100;
          const rightPct = ((scaleMax - hi) / scaleRange) * 100;

          return (
            <OutlookRow
              key={day.dateISO}
              day={day}
              displayLow={Math.round(lo)}
              displayHigh={Math.round(hi)}
              leftPct={leftPct}
              rightPct={rightPct}
              onOpenForecastDay={onOpenForecastDay}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OutlookRowProps {
  day: DailyPeriod;
  displayLow: number;
  displayHigh: number;
  leftPct: number;
  rightPct: number;
  onOpenForecastDay: (dateISO: string) => void;
}

function OutlookRow({ day, displayLow, displayHigh, leftPct, rightPct, onOpenForecastDay }: OutlookRowProps) {
  return (
    <>
      <div className="date">
        <button
          type="button"
          className="outlook-date-trigger"
          onClick={() => onOpenForecastDay(day.dateISO)}
          aria-label={`Show forecast narrative for ${day.dayOfWeek} ${day.dateLabel}`}
        >
          <span className="dow">{day.dayOfWeek}</span>
          <span className="dot">·</span>
          <span className="dt">{day.dateLabel}</span>
        </button>
      </div>
      <div className="icon">
        <WxIcon code={day.iconCode} size={30} />
      </div>
      <div className={precipClass(day.precipProbPct)}>
        {day.precipProbPct}%
      </div>
      <div className="range">
        <div className="seg" style={{ left: `${leftPct}%`, right: `${rightPct}%` }}></div>
        <div className="tick" style={{ left: `${leftPct}%` }}></div>
        <div className="tick" style={{ left: `${100 - rightPct}%` }}></div>
      </div>
      <div className="lh">
        <span className="l">{displayLow}</span>
        <span className="sep">·</span>
        <span className="h">{displayHigh}</span>
      </div>
    </>
  );
}
