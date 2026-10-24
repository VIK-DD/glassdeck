import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg' | 'xl';

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>;

interface ButtonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children: ReactNode;
}

/** Pill button with a text label and optional leading icon. */
export function Button({ variant = 'secondary', size = 'md', icon, children, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx(styles.button, styles[variant], styles[size], className)} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

interface IconButtonProps extends Omit<NativeButtonProps, 'aria-label'> {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Circular icon-only button. Sizes map to the touch tokens: md 56, lg 72, xl 96. */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(styles.button, styles.iconOnly, styles[variant], styles[size], className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
