interface ForecastButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function ForecastButton({ onClick, disabled = false }: ForecastButtonProps) {
  return (
    <button
      type="button"
      className="forecast-inline-trigger"
      onClick={onClick}
      disabled={disabled}
      aria-label="Open today's forecast narrative"
      title="Open today's forecast narrative"
    >
      ▶
    </button>
  );
}
