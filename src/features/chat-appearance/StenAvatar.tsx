import type { StenAvatarProps } from './types';

export function StenAvatar({ size=32, className }: StenAvatarProps) {
  return (
    <span
      className={`sten-avatar ${className??''}`.trim()}
      style={{ width:size, height:size }}
      aria-label="STEN"
      role="img"
    >
      <img src="/brand/sten-mark.svg" alt="" aria-hidden="true" />
    </span>
  );
}
