import type { DailyPeriod } from '../../shared/types';

interface ForecastBodyProps {
  period: DailyPeriod;
}

export function ForecastBody({ period }: ForecastBodyProps) {
  return (
    <>
      {period.dayPeriodName && period.dayDetailedForecast && (
        <>
          <h3 className="forecast-section-header">{period.dayPeriodName.toUpperCase()}</h3>
          <p className="forecast-narrative">{period.dayDetailedForecast}</p>
        </>
      )}
      {period.nightPeriodName && period.nightDetailedForecast && (
        <>
          <h3 className="forecast-section-header">{period.nightPeriodName.toUpperCase()}</h3>
          <p className="forecast-narrative">{period.nightDetailedForecast}</p>
        </>
      )}
    </>
  );
}
