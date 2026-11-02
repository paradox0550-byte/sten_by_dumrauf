import type { CSSProperties, SVGProps } from 'react';

export type StenLogoVariant = 'mark' | 'lockup' | 'wordmark';
export interface StenLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: StenLogoVariant;
  animated?: boolean;
  size?: number | string;
}
const MARK_TOP = 'M183 41 Q186 42 187 45 Q187 48 184 50 L108 91 Q104 93 104 97 L104 120 Q104 127 99 131 Q94 135 88 132 L55 115 Q48 112 48 104 L49 69 Q49 66 53 64 L124 23 Q133 18 142 21 Z';
const MARK_BOTTOM = 'M202 105 Q202 100 197 97 L165 82 Q159 79 153 83 L143 88 L140 120 Q140 125 135 128 L59 169 Q53 172 58 176 L105 198 Q112 201 119 197 L196 153 Q202 149 202 143 Z';

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
      {mark && <rect x="7" y="7" width="242" height="242" rx="47" fill="#0B0D10" />}
      <g transform={mark ? undefined : 'translate(0 8) scale(.46)'}>
        <path d={MARK_TOP} fill="#5B7CFA" />
        <path d={MARK_BOTTOM} fill="#5B7CFA" />
      </g>
      {(lockup || wordmark) && <>
        <text x={wordmark ? 0 : 148} y={wordmark ? 58 : 72} fill="var(--sten-ink)" fontFamily="Inter, Arial, sans-serif" fontSize={wordmark ? 54 : 56} fontWeight="700" letterSpacing="1">STEN</text>
        <text x={wordmark ? 2 : 150} y={wordmark ? 86 : 101} fill="var(--sten-muted)" fontFamily="Inter, Arial, sans-serif" fontSize="15" fontWeight="500" letterSpacing=".5">Smart Tracking &amp; Economic Navigator</text>
      </>}
    </svg>
  );
}
export default StenLogo;
