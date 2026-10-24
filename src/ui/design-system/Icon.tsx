import type { ReactElement } from 'react';

// 24x24 stroke icons for UI chrome. App buttons use the apps' own icons (see AppIcon).
export type IconName =
  | 'plus'
  | 'trash'
  | 'chevron-left'
  | 'chevron-right'
  | 'delete-left'
  | 'expand'
  | 'collapse'
  | 'checkmark'
  | 'alert';

const ICONS: Record<IconName, ReactElement> = {
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
