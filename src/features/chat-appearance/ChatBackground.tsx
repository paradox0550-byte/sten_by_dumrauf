import type { BackgroundId } from './types';

export function ChatBackground({ kind }: { kind: BackgroundId }) {
  if (kind === 'none') return null;

  return (
    <div className="sten-chat-background" aria-hidden="true">
      <svg viewBox="0 0 240 240" preserveAspectRatio="none">
        <defs>
          <pattern id="sten-chat-geometry" width="240" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <path d="M0 0H84L120 36L156 0H240" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M0 120H84L120 156L156 120H240" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M0 240H84L120 204L156 240H240" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sten-chat-geometry)" />
      </svg>
    </div>
  );
}
