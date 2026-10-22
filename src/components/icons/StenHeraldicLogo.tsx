import React from 'react';

export default function StenHeraldicLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="sten-fab-icon" role="img" aria-label="Герб STEN">
      <defs>
        <clipPath id="circle-clip">
          <circle cx="256" cy="256" r="256" />
        </clipPath>
      </defs>
      <g clipPath="url(#circle-clip)">
        {/* Фон */}
        <circle cx="256" cy="256" r="256" fill="#ffffff" />

        {/* Зеленые акантовые завитки слева */}
        <path d="M 120 200 Q 80 180 60 220 Q 40 260 70 300 Q 90 330 130 320 Q 160 310 150 270 Q 140 240 120 200 Z" fill="#1a5c2a" />
        <path d="M 100 250 Q 70 240 60 270 Q 50 300 80 320 Q 110 340 130 310 Q 150 280 120 260 Z" fill="#2d7a3a" />

        {/* Зеленые акантовые завитки справа */}
        <path d="M 392 200 Q 432 180 452 220 Q 472 260 442 300 Q 422 330 382 320 Q 352 310 362 270 Q 372 240 392 200 Z" fill="#1a5c2a" />
        <path d="M 412 250 Q 442 240 452 270 Q 462 300 432 320 Q 402 340 382 310 Q 362 280 392 260 Z" fill="#2d7a3a" />

        {/* Щит */}
        <path d="M 180 280 L 180 380 Q 180 420 256 440 Q 332 420 332 380 L 332 280 Z" fill="#ffffff" stroke="#000000" strokeWidth="3" />

        {/* Птица на щите */}
        <g transform="translate(256, 340)">
          <ellipse cx="0" cy="0" rx="25" ry="18" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <circle cx="20" cy="-15" r="12" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <path d="M 28 -15 L 38 -12 L 28 -10 Z" fill="#000000" />
          <path d="M -10 -5 Q 0 -15 15 -10 Q 10 0 -5 5 Z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <path d="M -20 5 L -35 10 L -30 15 L -25 12 L -20 15 Z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <line x1="-5" y1="15" x2="-8" y2="25" stroke="#000000" strokeWidth="2" />
          <line x1="5" y1="15" x2="8" y2="25" stroke="#000000" strokeWidth="2" />
          <path d="M 32 -12 Q 40 -20 45 -15" stroke="#1a5c2a" strokeWidth="2" fill="none" />
          <ellipse cx="42" cy="-18" rx="4" ry="2" fill="#1a5c2a" transform="rotate(-30 42 -18)" />
          <ellipse cx="45" cy="-16" rx="4" ry="2" fill="#1a5c2a" transform="rotate(20 45 -16)" />
        </g>

        {/* Шлем */}
        <path d="M 220 260 Q 220 240 256 235 Q 292 240 292 260 L 292 280 L 220 280 Z" fill="#c0c0c0" stroke="#000000" strokeWidth="2" />
        <path d="M 230 250 Q 230 245 256 242 Q 282 245 282 250" stroke="#000000" strokeWidth="1.5" fill="none" />

        {/* Нашлемник — птица сверху */}
        <g transform="translate(256, 180)">
          <ellipse cx="0" cy="0" rx="22" ry="16" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <circle cx="18" cy="-12" r="10" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <path d="M 25 -12 L 33 -10 L 25 -8 Z" fill="#000000" />
          <path d="M -8 -3 Q 0 -12 12 -8 Q 8 0 -3 3 Z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <path d="M -18 3 L -30 8 L -26 12 L -22 10 L -18 12 Z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          <line x1="-3" y1="13" x2="-5" y2="22" stroke="#000000" strokeWidth="2" />
          <line x1="5" y1="13" x2="7" y2="22" stroke="#000000" strokeWidth="2" />
          <path d="M 28 -10 Q 35 -18 42 -15" stroke="#1a5c2a" strokeWidth="2" fill="none" />
          <ellipse cx="38" cy="-17" rx="5" ry="3" fill="#1a5c2a" transform="rotate(-25 38 -17)" />
          <ellipse cx="42" cy="-15" rx="5" ry="3" fill="#1a5c2a" transform="rotate(15 42 -15)" />
          <ellipse cx="35" cy="-14" rx="4" ry="2.5" fill="#2d7a3a" transform="rotate(-40 35 -14)" />
        </g>
      </g>
    </svg>
  );
}
