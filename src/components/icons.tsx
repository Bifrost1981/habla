// Schlichte Strich-Icons (currentColor), damit sie in beiden Themes funktionieren.
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconSpeaker = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

export const IconTurtle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 15c0-4 3.5-7 8-7s8 3 8 7z" />
    <path d="M20 15h1.5a1.5 1.5 0 0 0 0-3H20" />
    <path d="M7 15v3M17 15v3" />
    <path d="M9 9.5 12 13l3-3.5" />
  </svg>
);

export const IconMic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </svg>
);

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconGear = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15 18 9 12l6-6" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);

export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconFlame = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path
      d="M12 22c4 0 7-2.7 7-6.6 0-3.4-2.3-5.6-3.6-7.4-.5 1.6-1.4 2.6-2.4 3C13 7.5 11.6 4.4 9 2c.3 3.2-1.5 5.2-3 7.2C4.8 10.8 5 12.4 5 15.4 5 19.3 8 22 12 22z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRepeat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" />
    <path d="M20 4v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
    <path d="M4 20v-4.5h4.5" />
  </svg>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 20h16" />
    <path d="M7 16v-5" />
    <path d="M12 16V7" />
    <path d="M17 16v-8" />
  </svg>
);
