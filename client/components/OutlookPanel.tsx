import type { DailyPeriod } from '../../shared/types';
import { WxIcon } from './WxIcon';

interface OutlookPanelProps {
  daily: DailyPeriod[];
}

function precipClass(pct: number): string {
  if (pct >= 50) return 'precip high';
  if (pct >= 26) return 'precip med';
  if (pct >= 10) return 'precip low';
  return 'precip zero';
}

export function OutlookPanel({ daily }: OutlookPanelProps) {
  if (daily.length === 0) return null;

  // Compute shared scale from all days' highs/lows
  const lows = daily.map((d) => d.lowF);
  const highs = daily.map((d) => d.highF);
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
        <span>RANGE {scaleMin}° — {scaleMax}°F</span>
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
          const leftPct = ((day.lowF - scaleMin) / scaleRange) * 100;
          const rightPct = ((scaleMax - day.highF) / scaleRange) * 100;

          return (
            <OutlookRow
              key={day.dateISO}
              day={day}
              leftPct={leftPct}
              rightPct={rightPct}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OutlookRowProps {
  day: DailyPeriod;
  leftPct: number;
  rightPct: number;
}

function OutlookRow({ day, leftPct, rightPct }: OutlookRowProps) {
  return (
    <>
      <div className="date">
        <span className="dow">{day.dayOfWeek}</span>
        <span className="dot">·</span>
        <span className="dt">{day.dateLabel}</span>
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
        <span className="l">{day.lowF}</span>
        <span className="sep">·</span>
        <span className="h">{day.highF}</span>
      </div>
    </>
  );
}
