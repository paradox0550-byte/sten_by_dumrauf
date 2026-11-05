import type { CSSProperties, SVGProps } from 'react';
export type DumraufLogoVariant = 'mark' | 'lockup' | 'wordmark';
export interface DumraufLogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> { variant?: DumraufLogoVariant; animated?: boolean; size?: number | string; }
const MARK_PATH = 'M76 36 V220 H132 C188 220 222 184 222 128 C222 72 188 36 132 36 Z';
export function DumraufLogo({ variant = 'mark', animated = false, size = 32, className, style, ...svgProps }: DumraufLogoProps) {
 const mark=variant==='mark', wordmark=variant==='wordmark', width=mark?256:variant==='lockup'?520:360, height=mark?256:variant==='lockup'?132:96, numericSize=typeof size==='number'?size:undefined;
 const cssVars={'--dumrauf-ink':'var(--text-primary, #E8F0F3)','--dumrauf-muted':'var(--text-secondary, #9FB0B8)'} as CSSProperties;
 return <svg {...svgProps} className={['dumrauf-logo','sten-logo',animated?'dumrauf-logo--animated sten-logo--animated':'',className||''].filter(Boolean).join(' ')} width={size} height={numericSize?numericSize*height/width:'auto'} viewBox={`0 0 ${width} ${height}`} fill="none" role={svgProps['aria-label']?'img':undefined} aria-hidden={svgProps['aria-label']?undefined:true} style={{...cssVars,...style}}>
  <g transform={mark?undefined:'translate(0 8) scale(.46)'}><path d={MARK_PATH} fill="none" stroke="var(--accent, #2DD4BF)" strokeWidth="19" strokeLinecap="round" strokeLinejoin="round"/><circle cx="132" cy="36" r="11" fill="var(--accent, #2DD4BF)"/></g>
  {(variant==='lockup'||wordmark)&&<><text x={wordmark?0:148} y={wordmark?58:72} fill="var(--dumrauf-ink)" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontSize={wordmark?49:54} fontWeight="700" letterSpacing="1.4">DUMRAUF</text><text x={wordmark?2:150} y={wordmark?86:101} fill="var(--dumrauf-muted)" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontSize="14" fontWeight="500" letterSpacing=".4">CALM INTELLIGENCE</text></>}
 </svg>;
}
export const StenLogo=DumraufLogo;
export type StenLogoVariant=DumraufLogoVariant;
export type StenLogoProps=DumraufLogoProps;
export default DumraufLogo;
