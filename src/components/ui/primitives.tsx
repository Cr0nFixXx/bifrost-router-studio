/** Small, dependency-free UI primitives shared across the studio. */
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
type BtnSize = 'sm' | 'md';

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: BtnSize;
  }
>(({ variant = 'primary', size = 'md', className = '', children, ...rest }, ref) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap';
  const sizes: Record<BtnSize, string> = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-3.5 py-2' };
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-neon/90 text-canvas hover:bg-neon shadow-[0_0_0_1px_rgba(94,234,212,0.4)] hover:shadow-glow',
    outline: 'border border-border text-ink hover:bg-surface-2 hover:border-border-strong',
    ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
    subtle: 'bg-surface-2 text-ink hover:bg-surface-3',
    danger: 'bg-neon-red/15 text-neon-red border border-neon-red/30 hover:bg-neon-red/25',
  };
  return (
    <button ref={ref} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
});
Button.displayName = 'Button';

export function IconButton({
  className = '',
  active,
  children,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label?: string }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={`grid place-items-center rounded-lg h-9 w-9 transition-all active:scale-95 ${
        active ? 'bg-neon/15 text-neon' : 'text-ink-muted hover:text-ink hover:bg-surface-2'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: 'neutral' | 'neon' | 'cyan' | 'violet' | 'amber' | 'red' | 'green';
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-3 text-ink-muted',
    neon: 'bg-neon/15 text-neon',
    cyan: 'bg-neon-cyan/15 text-neon-cyan',
    violet: 'bg-neon-violet/15 text-neon-violet',
    amber: 'bg-neon-amber/15 text-neon-amber',
    red: 'bg-neon-red/15 text-neon-red',
    green: 'bg-neon-green/15 text-neon-green',
  };
  return <span className={`chip ${tones[tone]} ${className}`}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-neon/80' : 'bg-surface-3'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink shadow ${checked ? 'right-0.5' : 'left-0.5'}`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: React.ReactNode }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="relative inline-flex rounded-lg bg-surface-2 p-0.5 border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === o.value ? 'text-canvas' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId="segmented-active"
              className="absolute inset-0 -z-10 rounded-md bg-neon"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-2xl',
  footer,
  zIndexClass = 'z-50',
  bodyClassName = 'px-6 py-5 max-h-[70vh] overflow-y-auto',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
  zIndexClass?: string;
  bodyClassName?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClass} grid place-items-center p-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`relative w-full ${width} glass-strong rounded-2xl shadow-depth overflow-hidden resize`}
              style={{ resize: 'both', minWidth: '420px', minHeight: '320px', maxWidth: '95vw', maxHeight: '92vh' }}
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : 'Dialog'}

          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {subtitle && <p className="text-xs text-ink-faint mt-0.5">{subtitle}</p>}
              </div>
              <IconButton onClick={onClose} label="Close">
                <X size={18} />
              </IconButton>
            </div>
            <div className={bodyClassName}>{children}</div>
            {footer && <div className="px-6 py-4 border-t border-border flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-3">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && <p className="text-xs text-ink-faint max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
