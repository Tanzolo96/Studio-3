import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from '@carbon/icons-react';
import type { MillState, Ticket } from '../engine/types';
import { escalation, frameView, type FrameStateKind, type TimerState } from '../engine/selectors';
import { fmt, frameWord, lotOf, ruleFor, withUnit } from '../engine/reducer';
import { TEST } from '../engine/vocab';
import { ago, timer } from '../engine/time';
import { AiTag, Button, cx, Dot, SeverityBadge, StatusChip, type ChipKind } from './primitives';

export function ticketChip(t: Ticket, now: number): ChipKind {
  if (t.status !== 'closed' && t.status !== 'fixed' && escalation(t, now).level > 0 && !t.seenAt) return 'escalated';
  return t.status;
}

export function readingLine(s: MillState, t: Ticket) {
  const r = t.readings.at(-1);
  if (!r) return t.raisedBy ? 'Raised by hand' : '';
  if (r.test === 'cv' && t.kind !== 'test_fail') return `CV +${r.value.toFixed(1)}%`;
  const rule = ruleFor(s, t.productId, r.test);
  const unit = TEST[r.test].unit;
  const lim = rule?.min !== undefined && rule?.max !== undefined ? `${fmt(r.test, rule.min)}–${fmt(r.test, rule.max)}` : rule?.min !== undefined ? `min ${fmt(r.test, rule.min)}` : `max ${fmt(r.test, rule!.max!)}`;
  return `${fmt(r.test, r.value)}${unit ? ` ${unit}` : ''} (${lim})`;
}

export function ticketMeta(s: MillState, t: Ticket) {
  const product = s.products.find((p) => p.id === t.productId)!;
  return `${frameWord(t.frameId)} · Lot ${t.lotId} · ${product.short}`;
}

export function TicketCard({ s, t, now, onOpen }: { s: MillState; t: Ticket; now: number; onOpen?: () => void }) {
  const live = t.status !== 'closed';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'block w-full rounded-[4px] border bg-raised p-4 text-left shadow-raised transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised)_92%,var(--ink))]',
        live && t.severity === 'critical' ? 'border-critical' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge level={t.severity} />
        <StatusChip kind={ticketChip(t, now)} />
      </div>
      <p className="t-body-strong mt-3">{t.title}</p>
      <p className="t-small mt-1 text-muted">{ticketMeta(s, t)}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="t-data">{readingLine(s, t)}</span>
        <span className="t-data text-[13px] text-muted">{ago((t.closedAt ?? now) - t.createdAt)}</span>
      </div>
    </button>
  );
}

// ---------- frame tile ----------
const FRAME_STYLE: Record<FrameStateKind, { border: string; text: string; dot: string }> = {
  running: { border: 'border-line', text: 'text-muted', dot: 'var(--neutral-state)' },
  warning: { border: 'border-major-fill border-2', text: 'text-major', dot: 'var(--major-fill)' },
  fault: { border: 'border-critical border-2', text: 'text-critical', dot: 'var(--critical)' },
  held: { border: 'border-held border-2', text: 'text-held', dot: 'var(--held)' },
  stopped: { border: 'border-line', text: 'text-ink', dot: 'var(--ink-muted)' },
};

export function FrameTile({ s, frameId, now, compact, onOpen }: { s: MillState; frameId: string; now: number; compact?: boolean; onOpen?: () => void }) {
  const full = frameView(s, frameId, now);
  const v = compact ? { ...full, label: full.short?.label ?? full.label, line: full.short?.line ?? full.line } : full;
  const st = FRAME_STYLE[v.kind];
  const frame = s.frames.find((f) => f.id === frameId)!;
  const product = s.products.find((p) => p.id === lotOf(s, frame.lotId).productId)!;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${frameId}, ${product.short}, lot ${frame.lotId}: ${full.label}. ${full.line}`}
      className={cx(
        'flex flex-col rounded-[4px] border bg-raised text-left shadow-raised transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised)_92%,var(--ink))]',
        st.border,
        v.kind === 'fault' && 'pulse-critical',
        compact ? 'gap-0.5 p-3' : 'gap-1 p-3.5',
        v.kind !== 'running' && v.kind !== 'stopped' ? (compact ? 'p-[11px]' : 'p-[13px]') : '',
      )}
    >
      <span className={cx('font-mono font-semibold tabular-nums', compact ? 'text-[20px] leading-6' : 't-stat')}>{frameId}</span>
      <span className="t-small text-muted">
        {product.short} · Lot {frame.lotId}
      </span>
      <span className={cx('t-small-strong mt-1 flex items-center gap-1.5', st.text)}>
        <Dot color={st.dot} />
        <span className="truncate">{v.label}</span>
      </span>
      <span className={cx('t-data whitespace-nowrap', compact && 'text-[13px]', v.kind === 'running' ? 'text-muted' : 'text-ink')}>{v.line}</span>
    </button>
  );
}

// ---------- stat tile ----------
export function StatTile({
  label,
  value,
  unit,
  delta,
  trend = 'neutral',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  trend?: 'good' | 'bad' | 'neutral';
}) {
  return (
    <div className="flex min-h-[110px] flex-col rounded-[4px] border border-line bg-raised p-4 shadow-raised">
      <span className="t-small text-muted">{label}</span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <span className="t-stat">{value}</span>
        {unit && <span className="t-small text-muted">{unit}</span>}
      </span>
      {delta && (
        <span className={cx('t-small-strong mt-auto flex items-center gap-1', trend === 'good' ? 'text-ok' : trend === 'bad' ? 'text-critical' : 'text-muted')}>
          {trend === 'good' && <ArrowDown size={14} aria-hidden />}
          {trend === 'bad' && <ArrowUp size={14} aria-hidden />}
          {delta}
        </span>
      )}
    </div>
  );
}

// ---------- AI insight ----------
export interface Insight {
  id: string;
  kind: 'Repeat pattern' | 'Rule suggestion' | 'Test sooner' | 'Likely cause';
  confidence: number;
  title: string;
  body: string;
  basis: string;
  action: string;
  onAction?: () => void;
}

export function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss?: () => void }) {
  return (
    <article className="flex flex-col rounded-[4px] border border-line bg-raised p-4 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <AiTag kind={insight.kind} />
        <span className="t-data text-[13px] text-muted">{insight.confidence}% confidence</span>
      </div>
      <h3 className="t-body-strong mt-3">{insight.title}</h3>
      <p className="t-small mt-1.5 text-ink">{insight.body}</p>
      <p className="t-small mt-2 text-muted">Based on: {insight.basis}</p>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" onClick={insight.onAction}>
          {insight.action}
        </Button>
        {onDismiss && (
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </article>
  );
}

// ---------- reading gauge ----------
export function ReadingGauge({
  test,
  value,
  min,
  max,
  pending,
  drift,
}: {
  test: keyof typeof TEST;
  value?: number;
  min?: number;
  max?: number;
  pending?: boolean;
  drift?: boolean; // winding-sensor CV rise against its warning line
}) {
  const base = TEST[test];
  const t = drift ? { ...base, name: 'Winding sensor, CV rise', unit: '%', tooHigh: 'Past warning line' } : base;
  const has = value !== undefined && !Number.isNaN(value);
  const outside = has && ((min !== undefined && value! < min) || (max !== undefined && value! > max));
  const lo = min ?? (max! - (max! * 0.2));
  const hi = max ?? (min! + min! * 0.2);
  const span = hi - lo;
  const a = lo - span * 0.9;
  const b = hi + span * 0.9;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - a) / (b - a)) * 100));
  const word = !has ? (pending ? 'Waiting for a reading' : '') : outside ? (min !== undefined && value! < min ? t.tooLow : t.tooHigh) : 'Within limit';
  const limit = min !== undefined && max !== undefined ? `${fmt(test, min)}–${fmt(test, max)}` : min !== undefined ? `min ${fmt(test, min)}` : `max ${fmt(test, max!)}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="t-small-strong text-muted">{t.name}</span>
        <span className={cx('t-small-strong', outside ? (drift ? 'text-major' : 'text-critical') : 'text-muted')}>{word}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cx('t-reading', outside ? (drift ? 'text-major' : 'text-critical') : 'text-ink')}>{has ? `${drift ? '+' : ''}${fmt(test, value!)}` : '–'}</span>
        {t.unit && <span className="t-data text-muted">{t.unit}</span>}
      </div>
      <div className="relative h-3" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sunken" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-line-strong bg-raised"
          style={{ left: `${min !== undefined ? pos(min) : 0}%`, right: `${100 - (max !== undefined ? pos(max) : 100)}%` }}
        />
        {has && (
          <div
            className={cx('absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface-raised)] transition-[left] duration-300', outside ? (drift ? 'bg-major-fill' : 'bg-critical') : 'bg-neutral')}
            style={{ left: `${pos(value!)}%` }}
          />
        )}
      </div>
      <span className="t-data text-muted">
        {drift ? `Warning line +${fmt(test, max!)}%` : `Limit ${limit}${t.unit ? ` ${t.unit}` : ''}`}
      </span>
      <span className="sr-only">{has ? `${withUnit(test, value!)}, ${word}, limit ${limit}` : word}</span>
    </div>
  );
}

// ---------- response timer ----------
export function ResponseTimer({ elapsed, limitMins, state, level, frozen }: { elapsed: number; limitMins: number; state: TimerState; level: number; frozen?: boolean }) {
  const pct = Math.min(100, (elapsed / (limitMins * 60_000)) * 100);
  const note = frozen
    ? `to Seen · limit ${limitMins}:00`
    : level >= 2
      ? 'not seen · plant head told'
      : level === 1
        ? 'not seen · escalated to QC manager'
        : state === 'over'
          ? 'overdue, escalating'
          : `to Seen · limit ${limitMins}:00`;
  return (
    <div className="flex flex-col gap-2" role="timer" aria-live="off">
      <div className="flex items-baseline gap-2">
        <span className={cx('t-stat', state === 'over' ? 'text-critical' : state === 'warn' ? 'text-major' : 'text-ink')}>{timer(elapsed)}</span>
        <span className={cx('t-small', state === 'over' ? 'text-critical font-semibold' : 'text-muted')}>{note}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-linear"
          style={{ width: `${pct}%`, background: state === 'over' ? 'var(--critical)' : state === 'warn' ? 'var(--major-fill)' : 'var(--neutral-state)' }}
        />
      </div>
    </div>
  );
}
