import type { CSSProperties } from 'react';

export type StenBrandTheme = 'dark' | 'light' | 'paper' | 'system';
type Props = { theme?: StenBrandTheme; variant?: 'mark' | 'wordmark'; className?: string; alt?: string };

/** Theme-aware STEN brand asset. Uses local SVG assets only. */
export default function StenBrandMark({ theme = 'dark', variant = 'mark', className = '', alt = 'STEN' }: Props) {
  const resolved = theme === 'paper' ? 'light' : theme === 'system' ? 'dark' : theme;
  const src = variant === 'wordmark' ? `/brand/sten-logo-${resolved}.svg` : '/brand/sten-mark.svg';
  const style: CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'contain' };
  return <span className={`sten-brand-mark ${className}`.trim()} data-brand-theme={resolved}><img src={src} alt={alt} aria-label={alt} style={style} /></span>;
}
