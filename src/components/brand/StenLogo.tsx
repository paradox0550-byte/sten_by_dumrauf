import { useId, type CSSProperties, type SVGProps } from 'react';

export type StenLogoVariant = 'mark' | 'lockup' | 'wordmark';
export interface StenLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: StenLogoVariant; animated?: boolean; size?: number | string;
}
const MARK_1 = 'M183 41 Q186 42 187 45 Q187 48 184 50 L108 91 Q104 93 104 97 L104 120 Q104 127 99 131 Q94 135 88 132 L55 115 Q48 112 48 104 L49 69 Q49 66 53 64 L124 23 Q133 18 142 21 Z';
const MARK_2 = 'M202 105 Q202 100 197 97 L165 82 Q159 79 153 83 L143 88 L140 120 Q140 125 135 128 L59 169 Q53 172 58 176 L105 198 Q112 201 119 197 L196 153 Q202 149 202 143 Z';

export function StenLogo({ variant = 'mark', animated = false, size = 32, className, style, ...svgProps }: StenLogoProps) {
  const id = useId().replace(/:/g, '');
  const lockup = variant === 'lockup';
  const markOnly = variant === 'mark';
  const width = lockup ? 520 : markOnly ? 256 : 360;
  const height = lockup ? 132 : markOnly ? 256 : 96;
  const cyan = `sten-cyan-${id}`, blue = `sten-blue-${id}`, silver = `sten-silver-${id}`;
  const cssVars = { '--sten-ink': 'var(--text-primary, #17212B)', '--sten-muted': 'var(--text-secondary, #64748B)' } as CSSProperties;
  return (
    <>
      {animated && <style>{`@keyframes sten-logo-enter { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } } .sten-logo--animated { animation: sten-logo-enter 180ms ease-out both; } @media (prefers-reduced-motion: reduce) { .sten-logo--animated { animation: none; } }`}</style>}
      <svg {...svgProps} className={`sten-logo ${animated ? 'sten-logo--animated ' : ''}${className || ''}`.trim()} width={size} height={lockup ? 'auto' : size} viewBox={`0 0 ${width} ${height}`} fill="none" role={svgProps['aria-label'] ? 'img' : undefined} aria-hidden={svgProps['aria-label'] ? undefined : true} style={{ ...cssVars, ...style }}>
        <defs>
          <linearGradient id={cyan} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#18E0EC"/><stop offset="1" stopColor="#058EBB"/></linearGradient>
          <linearGradient id={blue} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#167DEB"/><stop offset="1" stopColor="#103FAD"/></linearGradient>
          <linearGradient id={silver} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F8FBFD"/><stop offset=".45" stopColor="#AAB7C2"/><stop offset=".7" stopColor="#F7FAFC"/><stop offset="1" stopColor="#687783"/></linearGradient>
        </defs>
        {(markOnly || lockup) && <g transform={lockup ? 'translate(0 8) scale(.46)' : undefined}>
          <path d={MARK_1} fill={`url(#${cyan})`} stroke={`url(#${silver})`} strokeWidth="5" strokeLinejoin="round"/>
          <path d={MARK_2} fill={`url(#${blue})`} stroke={`url(#${silver})`} strokeWidth="5" strokeLinejoin="round"/>
          <path d={MARK_1} fill="none" stroke="#FFFFFF" strokeOpacity=".65" strokeWidth="1.4"/>
          <path d={MARK_2} fill="none" stroke="#FFFFFF" strokeOpacity=".58" strokeWidth="1.4"/>
        </g>}
        {(lockup || variant === 'wordmark') && <>
          <text x={variant === 'wordmark' ? 0 : 148} y={variant === 'wordmark' ? 58 : 72} fill="var(--sten-ink)" fontFamily="Inter, Arial, sans-serif" fontSize={variant === 'wordmark' ? 54 : 56} fontWeight="700" letterSpacing="1">STEN</text>
          <text x={variant === 'wordmark' ? 2 : 150} y={variant === 'wordmark' ? 86 : 101} fill="var(--sten-muted)" fontFamily="Inter, Arial, sans-serif" fontSize="15" fontWeight="500" letterSpacing=".5">AI ECOSYSTEM</text>
        </>}
      </svg>
    </>
  );
}
export default StenLogo;
