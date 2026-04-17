import type { IconCode } from '../../shared/types';

interface WxIconProps {
  code: IconCode;
  size?: number;
  className?: string;
}

export function WxIcon({ code, size = 64, className }: WxIconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <use href={`#wxicon-${code}`} />
    </svg>
  );
}
