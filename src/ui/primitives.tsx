import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { Severity, TicketStatus } from '../engine/types';
import { SEVERITY } from '../engine/vocab';

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

// ---------- severity: shape + word + colour, never colour alone ----------
export function SeverityShape({ level, size = 10, className }: { level: Severity; size?: number; className?: string }) {
  const fill = level === 'critical' ? 'var(--critical)' : level === 'major' ? 'var(--major-fill)' : 'var(--neutral-state)';
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className={cx('shrink-0', className)}>
      {level === 'critical' && <path d="M5 0.6 9.6 9H0.4Z" fill={fill} />}
      {level === 'major' && <path d="M5 0.4 9.6 5 5 9.6 0.4 5Z" fill={fill} />}
      {level === 'minor' && <circle cx="5" cy="5" r="4.3" fill={fill} />}
    </svg>
  );
}

const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-critical-soft text-critical',
  major: 'bg-major-soft text-major',
  minor: 'bg-minor-soft text-minor',
};

export function SeverityBadge({ level, className }: { level: Severity; className?: string }) {
  return (
    <span className={cx('t-label inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2', SEV_STYLE[level], className)}>
      <SeverityShape level={level} />
      {SEVERITY[level].word}
    </span>
  );
}

// ---------- status chip ----------
export type ChipKind = TicketStatus | 'escalated' | 'on_hold' | 'released' | 'reprocess' | 'downgrade' | 'pending' | 'passed' | 'failed';
const CHIP: Record<ChipKind, { word: string; cls: string; dot: string }> = {
  open: { word: 'Open', cls: 'bg-critical-soft text-critical', dot: 'var(--critical)' },
  seen: { word: 'Seen', cls: 'bg-brand-soft text-brand-text', dot: 'var(--brand)' },
  working: { word: 'Fixing', cls: 'bg-major-soft text-major', dot: 'var(--major)' },
  fixed: { word: 'Fixed', cls: 'bg-ok-soft text-ok', dot: 'var(--ok)' },
  closed: { word: 'Closed', cls: 'bg-minor-soft text-minor', dot: 'var(--neutral-state)' },
  escalated: { word: 'Escalated', cls: 'bg-critical-soft text-critical', dot: 'var(--critical)' },
  on_hold: { word: 'On hold', cls: 'bg-held-soft text-held', dot: 'var(--held)' },
  released: { word: 'Released', cls: 'bg-ok-soft text-ok', dot: 'var(--ok)' },
  reprocess: { word: 'Reprocess', cls: 'bg-minor-soft text-minor', dot: 'var(--neutral-state)' },
  downgrade: { word: 'Lower grade', cls: 'bg-minor-soft text-minor', dot: 'var(--neutral-state)' },
  pending: { word: 'Waiting', cls: 'bg-minor-soft text-minor', dot: 'var(--neutral-state)' },
  passed: { word: 'Passed', cls: 'bg-ok-soft text-ok', dot: 'var(--ok)' },
  failed: { word: 'Failed', cls: 'bg-critical-soft text-critical', dot: 'var(--critical)' },
};

export function StatusChip({ kind, label, className }: { kind: ChipKind; label?: string; className?: string }) {
  const c = CHIP[kind];
  return (
    <span className={cx('t-small-strong inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5', c.cls, className)}>
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} aria-hidden />
      {label ?? c.word}
    </span>
  );
}

// ---------- buttons ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-[var(--brand-hover)]',
  secondary: 'bg-raised text-ink border border-line-strong hover:bg-sunken',
  danger: 'bg-critical text-on-critical hover:bg-[var(--critical-hover)]',
  ghost: 'bg-transparent text-brand-text hover:bg-brand-soft',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg'; icon?: ReactNode; block?: boolean }
>(function Button({ variant = 'primary', size = 'md', icon, block, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-[10px] font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100',
        size === 'lg' ? 'h-12 px-5 text-[15px]' : 'h-10 px-4 text-[15px]',
        block && 'w-full',
        VARIANT[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------- text field ----------
export function TextField({
  label,
  unit,
  error,
  hint,
  id,
  className,
  big,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; unit?: string; error?: string; hint?: string; big?: boolean }) {
  const fid = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fid} className="t-small-strong text-muted">
        {label}
      </label>
      <div
        className={cx(
          'flex items-center rounded-[10px] border bg-raised focus-within:outline-2 focus-within:outline-offset-0',
          big ? 'h-16' : 'h-12',
          error ? 'border-critical focus-within:outline-critical' : 'border-line-strong focus-within:outline-brand',
        )}
      >
        <input
          id={fid}
          {...rest}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={cx('h-full min-w-0 flex-1 bg-transparent px-3 outline-none focus-visible:outline-none placeholder:text-[var(--ink-muted)]', big ? 't-reading' : 't-data text-[15px]')}
        />
        {unit && <span className="t-data pr-3 text-muted">{unit}</span>}
      </div>
      {error ? (
        <p id={`${fid}-err`} role="alert" className="t-small text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="t-small text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="t-small-strong text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Large tappable choice used for causes, problems, severity. */
export function Choice({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'min-h-12 rounded-[10px] border px-3 py-2 text-left t-body transition-colors',
        selected ? 'border-brand bg-brand-soft font-semibold text-ink outline outline-1 outline-brand' : 'border-line-strong bg-raised text-ink hover:bg-sunken',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AiSpark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function AiTag({ kind }: { kind: string }) {
  return (
    <span className="t-small-strong inline-flex h-6 items-center whitespace-nowrap gap-1.5 rounded-[6px] bg-ai-soft px-2 text-ai">
      <AiSpark />
      AI · {kind}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export function Empty({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="text-neutral">{icon}</div>}
      <p className="t-body-strong">{title}</p>
      {body && <p className="t-small max-w-[36ch] text-muted">{body}</p>}
    </div>
  );
}
