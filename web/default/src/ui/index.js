import React from 'react';

export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  as: Component = 'button',
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <Component
      className={cn('nm-button', `nm-button-${variant}`, `nm-button-${size}`, className)}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className='nm-button-spinner' aria-hidden='true' /> : null}
      {children}
    </Component>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <section className={cn('nm-card', className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('nm-card-header', className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('nm-card-content', className)} {...props}>
      {children}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn('nm-input', className)} {...props} />;
}

export function Badge({ className, tone = 'neutral', children, ...props }) {
  return (
    <span className={cn('nm-badge', `nm-badge-${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export function Spinner({ label = '加载中...' }) {
  return (
    <div className='nm-spinner-wrap' role='status' aria-label={label}>
      <span className='nm-spinner' aria-hidden='true' />
      <span>{label}</span>
    </div>
  );
}

export function Icon({ icon, children, label, size = 16, className }) {
  const element = icon || children;
  if (!element) return null;
  return React.cloneElement(element, {
    size,
    className: cn('nm-icon', className, element.props.className),
    'aria-hidden': label ? undefined : true,
    'aria-label': label,
  });
}
