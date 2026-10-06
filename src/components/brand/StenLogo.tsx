import type { CSSProperties, SVGProps } from 'react';

export type StenLogoVariant = 'mark' | 'lockup' | 'wordmark';

export interface StenLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant?: StenLogoVariant;
  animated?: boolean;
  size?: number | string;
}

const MARK_1 = 'M183 41 Q186 42 187 45 Q187 48 184 50 L108 91 Q104 93 104 97 L104 120 Q104 127 99 131 Q94 135 88 132 L55 115 Q48 112 48 104 L49 69 Q49 66 53 64 L124 23 Q133 18 142 21 Z';
const MARK_2 = 'M202 105 Q202 100 197 97 L165 82 Q159 79 153 83 L143 88 L140 120 Q140 125 135 128 L59 169 Q53 172 58 176 L105 198 Q112 201 119 197 L196 153 Q202 149 202 143 Z';

export function StenLogo({
  variant = 'mark',
  animated = false,
  size = 32,
  className,
  style,
  ...svgProps
}: StenLogoProps) {
  const lockup = variant === 'lockup';
  const markOnly = variant === 'mark';

  const width = lockup ? 520 : markOnly ? 256 : 360;
  const height = lockup ? 132 : markOnly ? 256 : 96;

  const cssVars = {
    '--sten-brand': '#5B7CFA',
    '--sten-ink': '#0B0D10',
    '--sten-muted': '#5B6578',
  } as CSSProperties;

  return (
    <>
      {animated && (
        <style>{`
          @keyframes sten-logo-enter {
            from { opacity: 0; transform: translateY(3px) scale(.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .sten-logo--animated {
            transform-origin: center;
            animation: sten-logo-enter 260ms cubic-bezier(.2,.8,.2,1) both;
          }
          @media (prefers-reduced-motion: reduce) {
            .sten-logo--animated { animation: none; }
          }
        `}</style>
      )}
      <svg
        {...svgProps}
        className={className ? `sten-logo ${animated ? 'sten-logo--animated' : ''} ${className}` : `sten-logo ${animated ? 'sten-logo--animated' : ''}`}
        width={size}
        height={lockup ? 'auto' : size}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        role={svgProps['aria-label'] ? 'img' : undefined}
        aria-hidden={svgProps['aria-label'] ? undefined : true}
        style={{ ...cssVars, ...style }}
      >
        {(markOnly || lockup) && (
          <g transform={lockup ? 'translate(0 8) scale(.46)' : undefined}>
            <path d={MARK_1} fill="var(--sten-brand)" />
            <path d={MARK_2} fill="var(--sten-brand)" />
          </g>
        )}

        {(lockup || variant === 'wordmark') && (
          <>
            <text
              x={variant === 'wordmark' ? 0 : 148}
              y={variant === 'wordmark' ? 58 : 72}
              fill="var(--sten-ink)"
              fontFamily="Inter, Arial, sans-serif"
              fontSize={variant === 'wordmark' ? 54 : 56}
              fontWeight="800"
              letterSpacing="1"
            >
              STEN
            </text>
            <text
              x={variant === 'wordmark' ? 2 : 150}
              y={variant === 'wordmark' ? 86 : 101}
              fill="var(--sten-muted)"
              fontFamily="Inter, Arial, sans-serif"
              fontSize="15"
              fontWeight="500"
              letterSpacing=".5"
            >
              Smart Tracking &amp; Economic Navigator
            </text>
          </>
        )}
      </svg>
    </>
  );
}

export default StenLogo;
