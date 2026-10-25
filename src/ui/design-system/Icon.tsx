import type { ReactElement } from 'react';

// 24x24 stroke icons for UI chrome. App buttons use the apps' own icons (see AppIcon).
// Each name has an SF Symbols counterpart for a future SwiftUI build.
export type IconName =
  | 'now'
  | 'mixer'
  | 'gauge'
  | 'grid'
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'mic'
  | 'mic-off'
  | 'speaker'
  | 'speaker-off'
  | 'headphones'
  | 'clip'
  | 'cpu'
  | 'thermometer'
  | 'memory'
  | 'plus'
  | 'trash'
  | 'chevron-left'
  | 'chevron-right'
  | 'delete-left'
  | 'expand'
  | 'collapse'
  | 'checkmark'
  | 'alert';

const FILLED = { fill: 'currentColor', stroke: 'none' } as const;

const ICONS: Record<IconName, ReactElement> = {
  now: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  mixer: <path d="M5 21v-7M5 10V3M12 21v-9M12 8V3M19 21v-5M19 12V3M3 14h4M10 8h4M17 16h4" />,
  gauge: (
    <>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 13l4-5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.8" />
      <rect x="14" y="4" width="6" height="6" rx="1.8" />
      <rect x="4" y="14" width="6" height="6" rx="1.8" />
      <rect x="14" y="14" width="6" height="6" rx="1.8" />
    </>
  ),
  play: <path {...FILLED} d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />,
  pause: (
    <>
      <rect {...FILLED} x="6" y="4" width="4" height="16" rx="1.2" />
      <rect {...FILLED} x="14" y="4" width="4" height="16" rx="1.2" />
    </>
  ),
  next: (
    <>
      <path {...FILLED} d="M3 6.2v11.6a.9.9 0 0 0 1.4.75L12 13v4.8a.9.9 0 0 0 1.4.75l8.3-5.8a.9.9 0 0 0 0-1.5l-8.3-5.8A.9.9 0 0 0 12 6.2V11L4.4 5.45A.9.9 0 0 0 3 6.2z" />
    </>
  ),
  previous: (
    <>
      <path {...FILLED} d="M21 6.2v11.6a.9.9 0 0 1-1.4.75L12 13v4.8a.9.9 0 0 1-1.4.75l-8.3-5.8a.9.9 0 0 1 0-1.5l8.3-5.8A.9.9 0 0 1 12 6.2V11l7.6-5.55A.9.9 0 0 1 21 6.2z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  'mic-off': (
    <>
      <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5" />
      <path d="M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  'speaker-off': (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M17 9.5l5 5M22 9.5l-5 5" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="5" height="7" rx="2" />
      <rect x="16" y="14" width="5" height="7" rx="2" />
    </>
  ),
  clip: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle {...FILLED} cx="12" cy="12" r="4.5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
    </>
  ),
  thermometer: <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />,
  memory: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7.5 10.5v3M12 10.5v3M16.5 10.5v3M6 20v-3M10 20v-3M14 20v-3M18 20v-3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'delete-left': (
    <>
      <path d="M21 5H9l-6 7 6 7h12z" />
      <path d="M12 9l6 6M18 9l-6 6" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  checkmark: <path d="M5 12.5l4.5 4.5L19 7" />,
  alert: <path d="M12 7v6M12 17h.01" />,
};

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
