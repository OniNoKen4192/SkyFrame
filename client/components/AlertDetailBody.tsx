import type { Alert } from '../../shared/types';
import { formatAlertMeta, parseDescription } from '../alert-detail-format';

interface AlertDetailBodyProps {
  alert: Alert;
  timezone: string | null;
}

export function AlertDetailBody({ alert, timezone }: AlertDetailBodyProps) {
  const meta = formatAlertMeta(alert, timezone);
  const paragraphs = parseDescription(alert.description);

  return (
    <>
      <div className="alert-detail-meta">{meta}</div>
      {paragraphs.map((p, i) => (
        <p key={i} className="alert-detail-paragraph">
          {p.prefix && <span className="alert-detail-prefix">{p.prefix}...</span>}
          {p.prefix ? ' ' : ''}{p.text}
        </p>
      ))}
    </>
  );
}
