// Machine detail and the AI insights hub, both built around a drawing of a ring frame.
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from '@carbon/icons-react';
import type { FrameStateKind } from '../engine/selectors';
import { frameView } from '../engine/selectors';
import { lotOf, productOfFrame, ruleFor } from '../engine/reducer';
import { predictAll, predictFrame, PARTS, type Part, type FramePrediction } from '../engine/predict';
import { insights } from '../engine/insights';
import { OFFLINE_NOTE, TEST, frameSources } from '../engine/vocab';
import { dayMonth, hhmm } from '../engine/time';
import { useMillState, useNow } from '../store/store';
import { cx, SeverityBadge, StatusChip } from '../ui/primitives';
import { Dial, SegmentMeter } from '../ui/charts';
import { InsightCard, ticketChip } from '../ui/cards';
import { Panel } from './Overview';

const STATE_COLOR: Record<FrameStateKind, string> = {
  running: 'var(--ok)',
  warning: 'var(--major-fill)',
  fault: 'var(--critical)',
  held: 'var(--brand)',
  stopped: 'var(--line-strong)',
};
const STATE_WORD: Record<FrameStateKind, string> = { running: 'Running', warning: 'Warning', fault: 'Failed', held: 'Yarn on hold', stopped: 'Stopped' };
type Level = 'low' | 'watch' | 'high';
const LEVEL_FILL: Record<Level, string> = { high: 'var(--critical)', watch: 'var(--major-fill)', low: 'var(--ok)' };
/** Same scale, but dark enough to read as text in both themes. */
const LEVEL_TEXT: Record<Level, string> = { high: 'var(--critical)', watch: 'var(--major)', low: 'var(--ok)' };
const LEVEL_WORD: Record<Level, string> = { high: 'High', watch: 'Watch', low: 'Low' };
const LEVEL_PCT: Record<Level, number> = { high: 100, watch: 66, low: 33 };

function LevelChip({ level }: { level: Level }) {
  return (
    <span className="t-small-strong inline-flex items-center gap-1.5" style={{ color: LEVEL_TEXT[level] }}>
      <span className="size-2 rounded-full" style={{ background: LEVEL_FILL[level] }} />
      {LEVEL_WORD[level]}
    </span>
  );
}

/** The zone of the machine each part covers on the drawing. The whole zone glows: we know the area, not the exact roller or spindle. */
const ZONE: Record<Part, { x: number; y: number; w: number; h: number }> = {
  creel: { x: 112, y: 18, w: 380, h: 44 },
  drafting: { x: 112, y: 102, w: 196, h: 34 },
  apron: { x: 300, y: 102, w: 212, h: 34 },
  spindles: { x: 112, y: 182, w: 400, h: 74 },
  environment: { x: 500, y: 24, w: 38, h: 34 },
};

/** Where each part sits on the drawing (viewBox 0 0 560 300). */
const SPOT: Record<Part, { x: number; y: number; label: string }> = {
  creel: { x: 290, y: 40, label: 'Creel' },
  drafting: { x: 230, y: 118, label: 'Drafting' },
  apron: { x: 360, y: 118, label: 'Aprons' },
  spindles: { x: 300, y: 214, label: 'Spindles' },
  environment: { x: 518, y: 40, label: 'Humidity' },
};

/** A side view of a ring frame: creel of roving bobbins, drafting rollers, spindles with cops. */
export function RingFrameArt({ state, risks, focus }: { state: FrameStateKind; risks?: Partial<Record<Part, Level>>; focus?: Part | null }) {
  const spin = state !== 'stopped';
  const cop = STATE_COLOR[state];
  const spindles = Array.from({ length: 12 }, (_, i) => 120 + i * 32);
  return (
    <svg viewBox="0 0 560 300" className="h-auto w-full" role="img" aria-label={`Ring frame drawing, ${STATE_WORD[state]}`}>
      <defs>
        <pattern id="yarn" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="6" height="6" fill={cop} opacity={0.85} />
          <rect width="2" height="6" fill="var(--surface-raised)" opacity={0.35} className={spin ? 'yarn-turn' : undefined} />
        </pattern>
      </defs>
      {/* floor */}
      <line x1="20" y1="282" x2="540" y2="282" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 6" />
      {/* headstock with motor */}
      <rect x="24" y="96" width="74" height="182" rx="8" fill="var(--surface-sunken)" stroke="var(--line-strong)" />
      <circle cx="61" cy="150" r="20" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <g className={spin ? 'spin-slow' : undefined} style={{ transformOrigin: '61px 150px' } as CSSProperties}>
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line key={a} x1="61" y1="150" x2={61 + Math.cos((a * Math.PI) / 180) * 16} y2={150 + Math.sin((a * Math.PI) / 180) * 16} stroke="var(--ink-muted)" strokeWidth="2" />
        ))}
      </g>
      <rect x="36" y="200" width="50" height="8" rx="2" fill={state === 'fault' ? 'var(--critical)' : state === 'stopped' ? 'var(--line-strong)' : 'var(--ok)'} className={state === 'fault' ? 'pulse-dot' : undefined} />
      {/* frame body */}
      <rect x="98" y="150" width="440" height="128" rx="6" fill="var(--surface-sunken)" stroke="var(--line-strong)" />
      {/* creel with roving bobbins */}
      <line x1="110" y1="22" x2="530" y2="22" stroke="var(--line-strong)" strokeWidth="3" />
      {spindles.map((x) => (
        <g key={`r${x}`}>
          <line x1={x} y1="22" x2={x} y2="30" stroke="var(--line-strong)" />
          <rect x={x - 9} y="30" width="18" height="42" rx="7" fill="var(--held-soft)" stroke="var(--line-strong)" />
          <line x1={x} y1="72" x2={x} y2="106" stroke="var(--ink-muted)" strokeWidth="1" opacity={0.6} />
        </g>
      ))}
      {/* drafting zone: three roller lines */}
      {[100, 112, 124].map((y, k) => (
        <g key={y}>
          <rect x="108" y={y} width="424" height="7" rx="3.5" fill={k === 1 ? 'var(--line-strong)' : 'var(--ink-muted)'} opacity={0.75} />
          {spindles.map((x) => (
            <circle key={x} cx={x} cy={y + 3.5} r="4" fill="var(--surface-raised)" stroke="var(--line-strong)" className={spin ? 'spin-fast' : undefined} style={{ transformOrigin: `${x}px ${y + 3.5}px` } as CSSProperties} />
          ))}
        </g>
      ))}
      {/* yarn going down to the spindles */}
      {spindles.map((x) => (
        <line key={`y${x}`} x1={x} y1="131" x2={x} y2="168" stroke={cop} strokeWidth="1" opacity={0.7} />
      ))}
      {/* ring rail and spindles with cops */}
      <rect x="104" y="166" width="428" height="6" rx="3" fill="var(--ink-muted)" />
      {spindles.map((x) => (
        <g key={`s${x}`}>
          <rect x={x - 2} y="172" width="4" height="96" fill="var(--line-strong)" />
          <path d={`M${x - 9} 250 L${x - 9} 196 Q${x} 180 ${x + 9} 196 L${x + 9} 250 Z`} fill="url(#yarn)" stroke={cop} strokeWidth="1" />
        </g>
      ))}
      {/* humidity sensor */}
      <g>
        <rect x="504" y="30" width="28" height="22" rx="5" fill="var(--surface-raised)" stroke="var(--line-strong)" />
        <path d="M518 34 C514 40 513 44 518 47 C523 44 522 40 518 34 Z" fill="var(--data)" />
      </g>
      {/* risk hotspots */}
      {risks &&
        (Object.keys(SPOT) as Part[]).map((p) => {
          const lv = risks[p] ?? 'low';
          const on = focus === p;
          const c = LEVEL_FILL[lv];
          const { x, y, label } = SPOT[p];
          const z = ZONE[p];
          const text = `${label} · ${LEVEL_WORD[lv].toLowerCase()}`;
          const w = text.length * 6.2 + 30;
          if (lv === 'low' && !on) return null;
          return (
            <g key={p} opacity={focus && !on ? 0.4 : 1}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="8" fill={c} fillOpacity={lv === 'high' ? 0.18 : 0.12} stroke={c} strokeOpacity={0.7} strokeDasharray="5 4" className={lv === 'high' ? 'breathe' : undefined} />
              <circle cx={x} cy={y} r={on ? 8 : 6} fill={c} stroke="var(--surface-raised)" strokeWidth="2.5" />
              <rect x={x > 450 ? x - 12 - w : x + 12} y={y - 11} width={w} height="22" rx="6" fill="var(--surface-raised)" stroke={on ? c : 'var(--line)'} />
              <text x={x > 450 ? x - 4 - w : x + 20} y={y + 4} className="fill-[var(--ink)] text-[11px] font-semibold">
                {text}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/** A lab reading on a ruler: the green band is the limit, the needle is the latest value. */
function RulerReading({ test, value, min, max, at }: { test: keyof typeof TEST; value: number; min?: number; max?: number; at: number }) {
  const lo = min ?? value * 0.9, hi = max ?? value * 1.1;
  const span = hi - lo || 1;
  const from = lo - span * 0.5, to = hi + span * 0.5;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - from) / (to - from)) * 100));
  const out = (min !== undefined && value < min) || (max !== undefined && value > max);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-small text-muted">{TEST[test].name}</span>
        <span className={cx('t-data', out && 'text-critical')}>
          {value} {TEST[test].unit}
        </span>
      </div>
      <div className="relative mt-2 h-6">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="w-px bg-[var(--line-strong)]" style={{ height: i % 5 ? 6 : 12, opacity: 0.6 }} />
          ))}
        </div>
        <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-[2px] bg-ok-soft ring-1 ring-[var(--ok)]" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
        <span className="anim-pop absolute top-0 h-6 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${pos(value)}%`, background: out ? 'var(--critical)' : 'var(--brand)' }} />
      </div>
      <p className="t-small mt-1 text-muted">
        Limit {min ?? '–'} to {max ?? '–'} · tested {dayMonth(at)}, {hhmm(at)}
      </p>
    </div>
  );
}

function RiskList({ p, focus, setFocus }: { p: FramePrediction; focus: Part | null; setFocus: (x: Part | null) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {p.parts.map((x, i) => (
        <li key={x.part}>
          <button
            type="button"
            onMouseEnter={() => setFocus(x.part)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(x.part)}
            onBlur={() => setFocus(null)}
            className={cx('w-full rounded-[10px] border p-3 text-left transition-colors', focus === x.part ? 'border-[var(--brand)] bg-brand-soft' : 'border-line hover:bg-sunken')}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="t-small-strong">
                {i + 1}. {x.name}
              </span>
              <LevelChip level={x.level} />
            </div>
            <SegmentMeter className="mt-2" pct={LEVEL_PCT[x.level]} segments={3} height={6} color={LEVEL_FILL[x.level]} />
            <p className="t-small mt-2 text-muted">{x.how}</p>
            <p className="t-label mt-2 text-[10px] text-muted">Pointed out by</p>
            <ul className="t-small mt-1 flex flex-col gap-0.5">
              {x.evidence.map((e) => (
                <li key={e} className="flex gap-1.5">
                  <span className="text-muted">·</span>
                  {e}
                </li>
              ))}
            </ul>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- machine detail ----------
export function MachineDetail() {
  const { id = '' } = useParams();
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const [focus, setFocus] = useState<Part | null>(null);
  const frame = s.frames.find((f) => f.id === id);
  if (!frame) return <p className="t-body text-muted">No frame called {id}.</p>;
  const v = frameView(s, frame.id, now);
  const product = productOfFrame(s, frame.id);
  const lot = lotOf(s, frame.lotId);
  const p = predictFrame(s, frame.id, now);
  const since30 = now - 30 * 86_400_000;
  const tests30 = s.results.filter((r) => r.frameId === frame.id && r.at >= since30 && r.at <= now && !r.sampleError);
  const passPct = tests30.length ? Math.round((tests30.filter((r) => r.pass).length / tests30.length) * 100) : 100;
  const history = s.tickets.filter((t) => t.frameId === frame.id && t.createdAt <= now).sort((a, b) => b.createdAt - a.createdAt);
  const sisters = s.frames.filter((f) => f.lotId === frame.lotId && f.id !== frame.id);
  const risks = Object.fromEntries(p.parts.map((x) => [x.part, x.level])) as Record<Part, Level>;
  const hero = v.kind === 'fault' ? 'bg-critical text-on-critical' : v.kind === 'warning' ? 'bg-major-fill text-ink' : v.kind === 'held' ? 'bg-brand text-on-brand' : v.kind === 'stopped' ? 'bg-sunken text-ink' : 'bg-ok text-on-brand';
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/dashboard/machines" className="t-small-strong mb-2 inline-flex items-center gap-1 text-brand-text hover:underline">
            <ArrowLeft size={14} /> Machines
          </Link>
          <h1 className="t-page">{frame.id} · Ring frame</h1>
          <p className="t-small mt-0.5 text-muted">
            {frame.make} · {product.name} · Lot {lot.id} · {v.label}
          </p>
        </div>
        <Link to={`/dashboard/insights?frame=${frame.id}`} className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
          Breakdown watch <ArrowRight size={14} />
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="anim-in flex flex-col overflow-hidden rounded-[12px] border border-line bg-raised" aria-label="Machine">
          <div className="p-5">
            <RingFrameArt state={v.kind} risks={risks} focus={focus} />
          </div>
          <div className={cx('grid grid-cols-3 divide-x divide-[color-mix(in_srgb,currentColor_20%,transparent)]', hero)}>
            {[
              { k: 'Tests passed', v: `${passPct}%`, pct: passPct },
              { k: 'Faults, 90 days', v: `${p.faults90}`, pct: Math.min(100, p.faults90 * 15) },
              { k: 'Breakdown watch', v: LEVEL_WORD[p.level], pct: LEVEL_PCT[p.level], seg: 3 },
            ].map((x) => (
              <div key={x.k} className="p-4">
                <p className="t-label text-[10px] opacity-80">{x.k}</p>
                <p className="t-stat mt-1">{x.v}</p>
                <SegmentMeter className="mt-2" pct={x.pct} segments={'seg' in x ? x.seg : 12} height={6} color="currentColor" />
              </div>
            ))}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Breakdown watch" sub="An early warning, not a measured fault">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="t-stat !text-[40px] !leading-[44px]" style={{ color: LEVEL_TEXT[p.level] }}>
                  {LEVEL_WORD[p.level]}
                </p>
                <p className="t-body-strong mt-1">{p.horizon}</p>
                <p className="t-small mt-1 text-muted">Likely zone: {p.parts[0].name.toLowerCase()}. A fitter confirms on the spot.</p>
              </div>
              <Dial pct={LEVEL_PCT[p.level]} color={LEVEL_FILL[p.level]} label={`Breakdown watch ${LEVEL_WORD[p.level]}`} />
            </div>
          </Panel>
          <Panel title="Latest lab readings" sub="Green band is the limit for this yarn">
            <div className="flex flex-col gap-4">
              {p.readings.length ? (
                p.readings.map((r) => <RulerReading key={r.test} test={r.test} value={r.value} min={r.min ?? ruleFor(s, product.id, r.test)?.min} max={r.max ?? ruleFor(s, product.id, r.test)?.max} at={r.at} />)
              ) : (
                <p className="t-small text-muted">No lab results yet.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Where it might break" sub="Point at a part to find it on the machine">
          <RiskList p={p} focus={focus} setFocus={setFocus} />
        </Panel>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Fault history" sub={`${history.length} ticket${history.length === 1 ? '' : 's'} on this frame`}>
            {history.length ? (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {history.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => nav(`/dashboard/tickets/${t.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-sunken">
                      <SeverityBadge level={t.severity} />
                      <span className="min-w-0 flex-1">
                        <span className="t-small-strong block truncate">{t.title}</span>
                        <span className="t-small block truncate text-muted">{t.cause ?? 'Cause not recorded yet'}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <StatusChip kind={ticketChip(t, now)} />
                        <span className="t-data text-[11px] text-muted">{dayMonth(t.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small text-muted">No faults on this frame yet.</p>
            )}
          </Panel>
          <Panel title="Where this frame's data comes from" sub={`${frame.make} · the same list for every brand`}>
            <ul className="flex flex-col divide-y divide-[var(--line)]">
              {frameSources(frame.make).map((d) => (
                <li key={d.what} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="t-small-strong block">{d.what}</span>
                    <span className="t-small block text-muted">{d.from}</span>
                  </span>
                  <span className="t-small shrink-0 rounded-full bg-sunken px-2 py-0.5 text-ink">{d.how}</span>
                </li>
              ))}
            </ul>
            <p className="t-small mt-3 text-muted">{OFFLINE_NOTE}</p>
          </Panel>
          <Panel title="Sister frames" sub={`Also spinning lot ${lot.id}`}>
            <div className="flex flex-wrap gap-2">
              {sisters.map((f) => {
                const sv = frameView(s, f.id, now);
                return (
                  <Link key={f.id} to={`/dashboard/machines/${f.id}`} className="t-small-strong flex items-center gap-2 rounded-[8px] border border-line px-3 py-2 hover:bg-sunken">
                    <span className="size-2 rounded-full" style={{ background: STATE_COLOR[sv.kind] }} />
                    {f.id}
                    <span className="font-normal text-muted">{STATE_WORD[sv.kind]}</span>
                  </Link>
                );
              })}
              {!sisters.length && <p className="t-small text-muted">No other frame is on this lot.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ---------- AI insights hub ----------
export function InsightsHub() {
  const s = useMillState();
  const now = useNow();
  const nav = useNavigate();
  const nowMin = Math.floor(now / 60000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => predictAll(s, now), [s, nowMin]);
  const [params] = useSearchParams();
  const start = params.get('frame');
  const [picked, setPicked] = useState<string>(start && all.some((p) => p.frameId === start) ? start : all[0].frameId);
  const [focus, setFocus] = useState<Part | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const p = all.find((x) => x.frameId === picked)!;
  const v = frameView(s, picked, now);
  const risks = Object.fromEntries(p.parts.map((x) => [x.part, x.level])) as Record<Part, Level>;
  const high = all.filter((x) => x.level === 'high').length;
  const watch = all.filter((x) => x.level === 'watch').length;
  const ok = all.length - high - watch;
  const list = insights(s, now).filter((i) => !dismissed.includes(i.id));
  const product = productOfFrame(s, picked);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">
      <header className="anim-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-page">AI insights hub</h1>
          <p className="t-small mt-0.5 text-muted">Breakdown watch: pick a frame to see which zone to check first, and why. An early warning from fault history and lab tests, not a measured fault. People decide.</p>
        </div>
        <dl className="flex gap-6">
          <div>
            <dt className="t-label text-[10px] text-muted">No action</dt>
            <dd className="t-stat !text-[24px] text-ok">{ok}</dd>
          </div>
          <div>
            <dt className="t-label text-[10px] text-muted">High risk</dt>
            <dd className="t-stat !text-[24px] text-critical">{high}</dd>
          </div>
          <div>
            <dt className="t-label text-[10px] text-muted">To watch</dt>
            <dd className="t-stat !text-[24px] text-major">{watch}</dd>
          </div>
        </dl>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className="anim-in rounded-[12px] border border-line bg-raised p-3 lg:row-span-2 xl:row-span-1" aria-label="Pick a frame">
          <p className="t-label px-2 pb-2 text-[10px] text-muted">Frames, check these first</p>
          <ul className="flex max-h-[620px] flex-col gap-1 overflow-y-auto pr-1">
            {all.map((x) => (
              <li key={x.frameId}>
                <button
                  type="button"
                  aria-pressed={picked === x.frameId}
                  onClick={() => setPicked(x.frameId)}
                  className={cx('w-full rounded-[8px] px-2.5 py-2 text-left transition-colors', picked === x.frameId ? 'bg-brand-soft ring-1 ring-[var(--brand)]' : 'hover:bg-sunken')}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="t-small-strong">{x.frameId}</span>
                    <LevelChip level={x.level} />
                  </span>
                  <SegmentMeter className="mt-1.5" pct={LEVEL_PCT[x.level]} segments={3} height={4} color={LEVEL_FILL[x.level]} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="anim-in flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-line bg-raised" aria-label="Selected frame">
          <div className="flex items-start justify-between gap-3 p-5 pb-0">
            <div>
              <p className="t-label text-[10px] text-muted">
                {product.short} · Lot {s.frames.find((f) => f.id === picked)!.lotId} · {STATE_WORD[v.kind]}
              </p>
              <h2 className="t-section mt-1">{picked}</h2>
            </div>
            <Link to={`/dashboard/machines/${picked}`} className="t-small-strong flex items-center gap-1 text-brand-text hover:underline">
              Open machine <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-5">
            <RingFrameArt state={v.kind} risks={risks} focus={focus} />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-line p-5">
            <div>
              <p className="t-label text-[10px] text-muted">Breakdown watch</p>
              <p className="t-stat" style={{ color: LEVEL_TEXT[p.level] }}>
                {LEVEL_WORD[p.level]}
              </p>
            </div>
            <div>
              <p className="t-label text-[10px] text-muted">What to do</p>
              <p className="t-body-strong mt-1">{p.horizon}</p>
            </div>
            <div>
              <p className="t-label text-[10px] text-muted">Faults, 90 days</p>
              <p className="t-stat">{p.faults90}</p>
            </div>
          </div>
        </section>

        <Panel className="lg:col-start-2 xl:col-start-auto" title="Where it might break" sub="Point at a part to find it on the machine">
          <RiskList p={p} focus={focus} setFocus={setFocus} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => nav(`/dashboard/machines/${picked}`)} className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken">
              Open machine
            </button>
            <button type="button" onClick={() => nav('/dashboard/tickets')} className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken">
              See tickets
            </button>
          </div>
        </Panel>
      </div>

      <section className="flex flex-col gap-3" aria-label="Patterns this month">
        <h2 className="t-label text-muted">Patterns this month</h2>
        {list.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((i) => (
              <InsightCard key={i.id} insight={{ ...i, onAction: () => nav(i.target) }} onDismiss={() => setDismissed((d) => [...d, i.id])} />
            ))}
          </div>
        ) : (
          <p className="t-small text-muted">No new patterns this month.</p>
        )}
      </section>
      <p className="t-small text-muted">
        How it works: no sensor sits on these parts. The level comes from the causes recorded when this frame and its sister frames were fixed, which lab test is close to its limit (count points to drafting, CV to aprons, twist to spindles, CSP to humidity) and the winding-sensor drift. {Object.keys(PARTS).length} zones are watched per frame. Levels can become tested percentages once 6 to 12 months of fixes are recorded.
      </p>
    </div>
  );
}
