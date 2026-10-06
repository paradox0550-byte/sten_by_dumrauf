import type { UserAvatarProps } from './types';

const PALETTE = ['#5B7CFA','#7C5BFA','#5BFA9A','#FA9A5B','#FA5B7C','#5BC3FA'];

export function getUserInitials(user: UserAvatarProps['user']): string {
  if (!user) return '?';
  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  if (first && last) return (first.slice(0,1) + last.slice(0,1)).toUpperCase();
  if (first) return first.slice(0,1).toUpperCase();
  if (user.email?.trim()) return user.email.trim().slice(0,1).toUpperCase();
  return '?';
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i=0;i<value.length;i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getUserAvatarColor(user: UserAvatarProps['user']): string {
  const seed = user?.id?.trim() || user?.email?.trim() || getUserInitials(user);
  return PALETTE[fnv1a(seed) % PALETTE.length];
}

export function getUserAccessibleName(user: UserAvatarProps['user']): string {
  if (!user) return 'Вы';
  const name = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ');
  return name || 'Вы';
}

export function UserAvatar({ user, size=32, className }: UserAvatarProps) {
  const initials=getUserInitials(user);
  const label=getUserAccessibleName(user);
  const commonClass=`user-avatar ${className??''}`.trim();
  if (user?.avatarUrl) {
    return (
      <span className={commonClass} style={{ width:size, height:size }} aria-label={label} role="img">
        <img src={user.avatarUrl} alt="" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={commonClass}
      style={{ width:size, height:size, backgroundColor:getUserAvatarColor(user) }}
      aria-label={label}
      role="img"
    >
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}
