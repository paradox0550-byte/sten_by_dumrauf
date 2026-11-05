import type { CSSProperties, SVGProps } from 'react';

export type StenLogoVariant = 'mark' | 'lockup' | 'wordmark';
export interface StenLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: StenLogoVariant;
  animated?: boolean;
  size?: number | string;
}
const MARK_PATH = 'M176 55 C158 38 111 39 86 58 C61 77 74 103 111 116 L151 130 C190 144 196 171 167 190 C139 208 93 203 75 184';

export function StenLogo({ variant = 'mark', animated = false, size = 32, className, style, ...svgProps }: StenLogoProps) {
  const mark = variant === 'mark';
  const wordmark = variant === 'wordmark';
  const lockup = variant === 'lockup';
  const width = mark ? 256 : lockup ? 520 : 360;
  const height = mark ? 256 : lockup ? 132 : 96;
  const numericSize = typeof size === 'number' ? size : undefined;
  const cssVars = {
    '--sten-ink': 'var(--text-primary, #0B0D10)',
    '--sten-muted': 'var(--text-secondary, #5B6578)',
  } as CSSProperties;
  return (
    <svg {...svgProps}
      className={['sten-logo', animated ? 'sten-logo--animated' : '', className || ''].filter(Boolean).join(' ')}
      width={size} height={numericSize ? numericSize * height / width : 'auto'}
      viewBox={`0 0 ${width} ${height}`} fill="none"
      role={svgProps['aria-label'] ? 'img' : undefined}
      aria-hidden={svgProps['aria-label'] ? undefined : true}
      style={{ ...cssVars, ...style }}>
      <g transform={mark ? undefined : 'translate(0 8) scale(.46)'}>
        <path d={MARK_PATH} fill="none" stroke="var(--accent, #7D9F96)" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="176" cy="55" r="11" fill="var(--accent, #7D9F96)" />
      </g>
      {(lockup || wordmark) && <>
        <text x={wordmark ? 0 : 148} y={wordmark ? 58 : 72} fill="var(--sten-ink)" fontFamily="Inter, Arial, sans-serif" fontSize={wordmark ? 54 : 56} fontWeight="700" letterSpacing="1">STEN</text>
        <text x={wordmark ? 2 : 150} y={wordmark ? 86 : 101} fill="var(--sten-muted)" fontFamily="Inter, Arial, sans-serif" fontSize="15" fontWeight="500" letterSpacing=".5">Smart Tracking &amp; Economic Navigator</text>
      </>}
    </svg>
  );
}
export default StenLogo;
