// Rules (QC manager edits, everyone else reads) and Account (profile, people, shifts, notifications).
import { useRef, useState, type ReactNode } from 'react';
import type { Rule, Severity, ShiftId, User } from '../engine/types';
import { USERS } from '../engine/seed';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { findProduct, withinRule, userName } from '../engine/reducer';
import { currentRouting, mergedRouting, readDocument, rulesAsText, type FoundRule, type FoundSet } from '../engine/rulesText';
import { pdfToText } from './pdfText';
import { SEVERITY, TEST } from '../engine/vocab';
import { dayMonth, shiftAt } from '../engine/time';
import { cx, SeverityBadge } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';
import { PageHead } from './DashShell';
import { Panel } from './Overview';

// ---------- Rules ----------
/** Rules: who gets told and when, the test limits, the rules in plain words, and rules documents. */
export function RulesPage() {
  const user = useUser('dash');
  const canEdit = user.role === 'qc';
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <PageHead
        title="Rules"
        sub={canEdit ? 'Who QC Alert tells, when, and what counts as a failed test. Drop the mill’s rules PDF to add rules from it.' : 'Who QC Alert tells, when, and what counts as a failed test. Only the QC manager can change them.'}
      />
      <AlertChain canEdit={canEdit} />
      <RulesDocument canEdit={canEdit} />
      <RulesInWords />
      <LimitTables />
    </div>
  );
}

function AlertChain({ canEdit }: { canEdit: boolean }) {
  const s = useMillState();
  const user = useUser('dash');
  const dispatch = useDispatch();
  const r = currentRouting(s);
  const [d, setD] = useState<{ b: string; q: string; p: string } | null>(null);
  const [err, setErr] = useState('');
  const steps = [
    { at: '0 min', who: 'Shift supervisor of that frame', how: 'Phone alert, with sound for critical', key: null },
    { at: `${r.backupMins} min`, who: 'Backup supervisor on the same shift', how: 'Phone alert', key: 'b' as const },
    { at: `${r.qcMins} min`, who: 'QC manager', how: 'Phone alert with sound', key: 'q' as const },
    { at: `${r.plantMins} min`, who: 'Plant head', how: 'Phone alert and a call', key: 'p' as const },
  ];
  const save = () => {
    if (!d) return;
    const b = Number(d.b), q = Number(d.q), p = Number(d.p);
    if (![b, q, p].every((n) => Number.isFinite(n) && n >= 1)) return setErr('Use whole minutes, like 5');
    if (!(b < q && q < p)) return setErr('Each step must come after the one before it');
    dispatch({ type: 'routing/set', backupMins: b, qcMins: q, plantMins: p, by: user.id } as never);
    setD(null);
    setErr('');
  };
  const input = 't-data h-9 w-16 rounded-[8px] border border-line-strong bg-raised px-2 text-right';
  return (
    <Panel
      title="Who gets told, and when"
      sub="If nobody taps “I’m fixing it”, the alert moves up. The first person to tap owns it."
      aside={
        canEdit &&
        (d ? (
          <span className="flex gap-2">
            <button type="button" onClick={() => setD(null)} className="t-small-strong h-9 rounded-full border border-line px-3 hover:bg-sunken">
              Cancel
            </button>
            <button type="button" onClick={save} className="t-small-strong h-9 rounded-full bg-brand px-4 text-on-brand hover:bg-[var(--brand-hover)]">
              Save times
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setD({ b: String(r.backupMins), q: String(r.qcMins), p: String(r.plantMins) })} className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken">
            Change times
          </button>
        ))
      }
    >
      <ol className="grid gap-3 md:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.who} className="relative rounded-[12px] border border-line bg-sunken p-4">
            <p className="t-label text-[10px] text-muted">{i === 0 ? 'At once' : 'No answer after'}</p>
            <p className="t-stat mt-1">
              {d && st.key ? (
                <span className="flex items-baseline gap-1">
                  <input aria-label={`Minutes before ${st.who}`} className={input} value={d[st.key]} onChange={(e) => setD({ ...d, [st.key!]: e.target.value })} />
                  <span className="t-small">min</span>
                </span>
              ) : (
                st.at
              )}
            </p>
            <p className="t-body-strong mt-2">{st.who}</p>
            <p className="t-small text-muted">{st.how}</p>
          </li>
        ))}
      </ol>
      {err && <p className="t-small mt-3 text-critical">{err}</p>}
      <p className="t-small mt-4 text-muted">
        After the fix report the lab is asked to re-test. A failed re-test sends the alert back to the supervisor. Minor faults show only on the dashboard. Last changed {dayMonth(s.rules[0]?.updatedAt ?? 0)} by {userName(s, s.rules[0]?.updatedBy)}.
      </p>
    </Panel>
  );
}

function RulesInWords() {
  const s = useMillState();
  const lines = rulesAsText(s);
  const [copied, setCopied] = useState(false);
  return (
    <Panel
      title="The rules in plain words"
      sub="One sentence per rule, for people and for an AI to read and analyse"
      aside={
        <button
          type="button"
          className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken"
          onClick={() => {
            navigator.clipboard?.writeText(lines.join('\n')).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy as text'}
        </button>
      }
    >
      <ol className="t-small list-decimal gap-x-12 pl-6 text-ink lg:columns-2">
        {lines.map((l) => (
          <li key={l} className="mb-1.5 break-inside-avoid pl-1 marker:text-muted">
            {l}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function RulesDocument({ canEdit }: { canEdit: boolean }) {
  const s = useMillState();
  const user = useUser('dash');
  const dispatch = useDispatch();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [file, setFile] = useState<{ name: string; pages: number } | null>(null);
  const [found, setFound] = useState<FoundRule[]>([]);
  const [pick, setPick] = useState<boolean[]>([]);
  const [sets, setSets] = useState<FoundSet[]>([]);
  const [pickSet, setPickSet] = useState<boolean[]>([]);
  const [done, setDone] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const read = async (f: File) => {
    setErr('');
    setDone('');
    setBusy(true);
    try {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const { text, pages } = isPdf ? await pdfToText(f) : { text: await f.text(), pages: 1 };
      const doc = readDocument(text, s);
      setFile({ name: f.name, pages });
      setFound(doc.rules);
      setPick(doc.rules.map((r) => r.kind === 'routing' || r.kind === 'limit'));
      setSets(doc.sets);
      setPickSet(doc.sets.map(() => true));
      if (!doc.rules.length && !doc.sets.length) setErr('No rules found in this file. Is it a scanned image? Try a PDF with selectable text, or a CSV with columns yarn, buyer, test, lower, upper, severity.');
    } catch {
      setErr('This file could not be read. Drop a PDF with selectable text, a CSV, or a .txt file.');
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    const chosen = found.filter((_, i) => pick[i]);
    const routing = mergedRouting(currentRouting(s), chosen.filter((f) => f.routing));
    if (chosen.some((f) => f.routing) && !routing) return setErr('The times in this document do not make a chain (backup, then QC manager, then plant head). Untick one or change them by hand.');
    let applied = 0;
    for (const x of sets.filter((_, i) => pickSet[i])) {
      dispatch({ type: 'ruleset/add', yarn: x.yarn, buyer: x.buyer, source: file!.name, limits: x.limits, by: user.id } as never);
      applied += x.limits.length;
    }
    if (routing && chosen.some((f) => f.routing)) {
      dispatch({ type: 'routing/set', ...routing, by: user.id } as never);
      applied += chosen.filter((f) => f.routing).length;
    }
    for (const f of chosen.filter((x) => x.limit)) {
      const rule = s.rules.find((r) => r.id === f.limit!.ruleId)!;
      dispatch({ type: 'rule/set', ruleId: rule.id, min: f.limit!.min ?? rule.min, max: f.limit!.max ?? rule.max, severity: f.limit!.severity ?? rule.severity, escalateQcMins: routing?.qcMins ?? rule.escalateQcMins, escalatePhMins: routing?.plantMins ?? rule.escalatePhMins, by: user.id } as never);
      applied += 1;
    }
    const setLines = sets.map((x, i) => `${pickSet[i] ? 'Rule set added' : 'Rule set skipped'}: ${x.yarn}, ${x.buyer} (${x.limits.length} limits)`);
    dispatch({ type: 'rules/doc', name: file!.name, pages: file!.pages, found: [...setLines, ...found.map((f) => `${f.text} → ${f.meaning}`)], applied, by: user.id } as never);
    const nSets = pickSet.filter(Boolean).length;
    setDone(`${nSets ? `${nSets} rule set${nSets === 1 ? '' : 's'} added. ` : ''}${applied} rule${applied === 1 ? '' : 's'} applied from ${file!.name}. Test limits below are updated.`);
    reset();
  };
  const reset = () => {
    setFile(null);
    setFound([]);
    setSets([]);
  };
  const base = import.meta.env.VITE_STANDALONE === '1' ? '' : '/';
  const nPickSets = pickSet.filter(Boolean).length;
  const nPick = pick.filter(Boolean).length;
  const applyWord = [nPickSets ? `Add ${nPickSets} rule set${nPickSets === 1 ? '' : 's'}` : '', nPick ? `${nPickSets ? 'and ' : 'Apply '}${nPick} rule${nPick === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'Save the document';
  const KIND: Record<FoundRule['kind'], string> = { routing: 'Who gets told', limit: 'Test limit', builtin: 'Already built in', note: 'Note' };

  return (
    <Panel title="Add rules from a file" sub="Drop the mill’s rules as a PDF or a CSV (saved from Excel). QC Alert reads it here in the browser and lists what it understood, one rule set per yarn and buyer, for you to check.">
      {canEdit && !file && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a rules PDF here, or choose a file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void read(f);
          }}
          className={cx('flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-2 border-dashed px-6 py-10 text-center', over ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-sunken')}
        >
          <p className="t-body-strong">{busy ? 'Reading…' : 'Drop the rules PDF or CSV here'}</p>
          <p className="t-small text-muted">or click to choose a file · PDF with selectable text, CSV from Excel, or .txt</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,text/plain,.txt,text/csv,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {canEdit && !file && (
        <p className="t-small mt-2 text-muted">
          No file to hand? Try a sample:{' '}
          <a className="text-brand-text underline" href={`${base}rule-sets-sample.csv`} download>
            rule sets CSV
          </a>
          ,{' '}
          <a className="text-brand-text underline" href={`${base}rule-sets-sample.pdf`} download>
            rule sets PDF
          </a>{' '}
          or{' '}
          <a className="text-brand-text underline" href={`${base}rules-sample.pdf`} download>
            alert chain PDF
          </a>
          . CSV columns: yarn, buyer, test, lower, upper, severity.
        </p>
      )}
      {!canEdit && <p className="t-small text-muted">Only the QC manager adds rules documents.</p>}
      {err && <p className="t-small mt-3 text-critical">{err}</p>}
      {done && <p className="t-small-strong mt-3 text-ok">{done}</p>}

      {file && (found.length > 0 || sets.length > 0) && (
        <div className="mt-1">
          <p className="t-small-strong">
            {file.name} · {file.pages} page{file.pages > 1 ? 's' : ''} · {sets.length ? `${sets.length} rule set${sets.length > 1 ? 's' : ''}` : ''}
            {sets.length && found.length ? ' and ' : ''}
            {found.length ? `${found.length} other rule${found.length > 1 ? 's' : ''}` : ''} found
          </p>
          {sets.length > 0 && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sets.map((x, i) => {
                const existing = findProduct(s, x.yarn, x.buyer);
                const old = existing ? s.rules.filter((r) => r.productId === existing.id) : [];
                const on = !!pickSet[i];
                return (
                  <label key={`${x.yarn}|${x.buyer}`} className={cx('flex cursor-pointer flex-col gap-2 rounded-[12px] border p-4', on ? 'border-brand bg-brand-soft' : 'border-line opacity-70')}>
                    <span className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1 size-4" checked={on} onChange={(e) => setPickSet((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
                      <span className="min-w-0 flex-1">
                        <span className="t-body-strong block">{x.yarn}</span>
                        <span className="t-small text-muted">{x.buyer}</span>
                      </span>
                      <span className={cx('t-label rounded-[6px] px-2 py-0.5 text-[10px]', existing && old.length ? 'bg-major-soft text-major' : 'bg-ok-soft text-ok')}>{existing && old.length ? 'Replaces' : 'New set'}</span>
                    </span>
                    <ul className="t-small flex flex-col gap-1 pl-7">
                      {x.limits.map((l) => {
                        const was = old.find((r) => r.test === l.test);
                        const changed = was && (was.min !== l.min || was.max !== l.max || was.severity !== l.severity);
                        return (
                          <li key={l.test} className="flex justify-between gap-2">
                            <span>{TEST[l.test].name}</span>
                            <span className="t-data text-[13px]">
                              {changed && <span className="mr-1.5 text-muted line-through">{range(was.min, was.max)}</span>}
                              {range(l.min, l.max)} <span className="text-muted">· {SEVERITY[l.severity].word}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </label>
                );
              })}
            </div>
          )}
          {found.length > 0 && <ul className="mt-3 divide-y divide-[var(--line)] rounded-[12px] border border-line">
            {found.map((f, i) => {
              const can = f.kind === 'routing' || f.kind === 'limit';
              return (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Apply: ${f.meaning}`}
                    disabled={!can}
                    checked={!!pick[i]}
                    onChange={(e) => setPick((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                    className="mt-1 size-4"
                  />
                  <span className="min-w-0">
                    <span className="t-small block text-muted">“{f.text}”</span>
                    <span className="t-small-strong block">{f.meaning}</span>
                  </span>
                  <span className={cx('t-label rounded-[6px] px-2 py-0.5 text-[10px]', can ? 'bg-brand-soft text-brand-text' : f.kind === 'builtin' ? 'bg-ok-soft text-ok' : 'bg-sunken text-muted')}>{KIND[f.kind]}</span>
                </li>
              );
            })}
          </ul>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={apply} className="t-small-strong h-10 rounded-full bg-brand px-5 text-on-brand hover:bg-[var(--brand-hover)]">
              {applyWord}
            </button>
            <button
              type="button"
              onClick={reset}
              className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {s.rulesDocs.length > 0 && (
        <div className="mt-5">
          <p className="t-small-strong mb-2 text-muted">Documents added</p>
          <ul className="flex flex-col gap-2">
            {[...s.rulesDocs].reverse().map((doc) => (
              <li key={doc.at + doc.name}>
                <details className="rounded-[10px] border border-line px-4 py-2.5">
                  <summary className="t-small cursor-pointer">
                    <span className="t-small-strong">{doc.name}</span> · {dayMonth(doc.at)} · {userName(s, doc.by)} · {doc.applied} rule{doc.applied === 1 ? "" : "s"} applied
                  </summary>
                  <ul className="t-small mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
                    {doc.found.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

const range = (min?: number, max?: number) => (min !== undefined && max !== undefined ? `${min}–${max}` : min !== undefined ? `≥ ${min}` : max !== undefined ? `≤ ${max}` : '–');

type Draft = { min: string; max: string; severity: Severity; qc: string; ph: string };
const toNum = (v: string) => (v.trim() === '' ? undefined : Number(v));

function LimitTables() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const dispatch = useDispatch();
  const canEdit = user.role === 'qc';
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const [removed, setRemoved] = useState('');
  const since = now - 30 * 86_400_000;
  const runningOn = (pid: string) => s.frames.filter((f) => s.lots.find((l) => l.id === f.lotId)?.productId === pid);

  const start = (r: Rule) => {
    setEditing(r.id);
    setDropping(null);
    setError('');
    setDraft({ min: r.min?.toString() ?? '', max: r.max?.toString() ?? '', severity: r.severity, qc: String(r.escalateQcMins), ph: String(r.escalatePhMins) });
  };
  const impact = (r: Rule, d: Draft | null) => {
    const res = s.results.filter((x) => x.test === r.test && !x.sampleError && x.at >= since && x.at <= now && s.lots.find((l) => l.id === x.lotId)?.productId === r.productId);
    const now0 = res.filter((x) => !withinRule(r, x.value)).length;
    if (!d) return { total: res.length, now: now0, next: now0 };
    const next = res.filter((x) => !withinRule({ ...r, min: toNum(d.min), max: toNum(d.max) }, x.value)).length;
    return { total: res.length, now: now0, next };
  };
  const save = (r: Rule) => {
    if (!draft) return;
    const min = toNum(draft.min), max = toNum(draft.max);
    if ((draft.min && Number.isNaN(min)) || (draft.max && Number.isNaN(max))) return setError('Limits must be numbers, like 29.4');
    if (min === undefined && max === undefined) return setError('Set at least one limit');
    if (min !== undefined && max !== undefined && min >= max) return setError('The lower limit must be below the upper limit');
    const qc = Number(draft.qc), ph = Number(draft.ph);
    if (!(qc >= 1) || !(ph > qc)) return setError('Escalation to the plant head must come after escalation to the QC manager');
    dispatch({ type: 'rule/set', ruleId: r.id, min, max, severity: draft.severity, escalateQcMins: qc, escalatePhMins: ph, by: user.id } as never);
    setEditing(null);
    setSaved(r.id);
  };
  const input = 't-data h-9 w-20 rounded-[8px] border border-line-strong bg-raised px-2 text-right';

  return (
    <section className="flex flex-col gap-4" aria-label="Test limits">
      <div className="mt-2">
        <h2 className="t-section">Test limits</h2>
        <p className="t-small mt-1 text-muted">
          {canEdit
            ? 'One rule set per yarn and buyer. A reading outside a limit raises an alert. Edit a limit, remove a whole set, or add sets from a file above. Changes apply to the next test result.'
            : 'One rule set per yarn and buyer. Only the QC manager can change them.'}
        </p>
        <p className="t-small mt-2 text-muted">
          {s.products.filter((p) => s.rules.some((r) => r.productId === p.id)).length} rule sets · {s.rules.length} limits
        </p>
      </div>
      {removed && <p className="t-small-strong text-ok">{removed}</p>}
      {[...s.products]
        .map((p) => ({ p, added: Math.max(0, ...s.rules.filter((r) => r.productId === p.id && r.source).map((r) => r.updatedAt)) }))
        .sort((a, b) => b.added - a.added)
        .map(({ p, added }) => {
        const rules = s.rules.filter((r) => r.productId === p.id);
        const frames = runningOn(p.id);
        const source = rules.find((r) => r.source)?.source;
        if (!rules.length) {
          if (!frames.length) return null;
          return (
            <Panel key={p.id} title={p.name} sub={`${frames.length} frame${frames.length > 1 ? 's' : ''} running this yarn`}>
              <p className="t-small rounded-[10px] bg-critical-soft px-4 py-3 text-critical">No rule set. Tests on this yarn will not raise alerts until a rule set for {p.name} is added from a file.</p>
            </Panel>
          );
        }
        const confirm = removing === p.id;
        return (
          <Panel
            key={p.id}
            className={added && now - added < 6 * 3_600_000 ? 'anim-in border-brand' : undefined}
            title={added && now - added < 6 * 3_600_000 ? `${p.name} · just added` : p.name}
            sub={`Nominal count ${p.nominalNe} Ne · ${frames.length ? `${frames.length} frame${frames.length > 1 ? 's' : ''} running it` : 'no frame running it now'}${source ? ` · from ${source}, ${dayMonth(rules[0].updatedAt)}` : ''}`}
            aside={
              canEdit && !confirm ? (
                <button type="button" aria-label={`Remove rule set for ${p.name}`} onClick={() => setRemoving(p.id)} className="t-small-strong h-9 shrink-0 rounded-full border border-line px-4 text-critical hover:bg-critical-soft">
                  Remove set
                </button>
              ) : undefined
            }
          >
            {confirm && (
              <div role="alertdialog" aria-label={`Remove ${p.name}`} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-critical-soft px-4 py-3">
                <p className="t-small text-critical">
                  Remove all {rules.length} limits for {p.name}?{' '}
                  {frames.length ? `${frames.length} frame${frames.length > 1 ? 's' : ''} run this yarn now; their tests will not raise alerts until a new set is added.` : 'No frame runs this yarn now.'}
                </p>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setRemoving(null)} className="t-small-strong h-9 rounded-full border border-line bg-raised px-4 hover:bg-sunken">
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'ruleset/remove', productId: p.id, by: user.id } as never);
                      setRemoving(null);
                      setRemoved(`Removed the rule set for ${p.name}.`);
                    }}
                    className="t-small-strong h-9 rounded-full bg-critical px-4 text-on-critical hover:bg-[var(--critical-hover)]"
                  >
                    Remove set
                  </button>
                </span>
              </div>
            )}
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-left">
                <colgroup>
                  <col className="w-[20%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[17%]" />
                  <col className="w-[26%]" />
                </colgroup>
                <thead>
                  <tr className="t-label text-[10px] text-muted">
                    <th className="px-5 pb-2 font-semibold">Test</th>
                    <th className="pb-2 font-semibold">Lower</th>
                    <th className="pb-2 font-semibold">Upper</th>
                    <th className="pb-2 font-semibold">Severity</th>
                    <th className="pb-2 font-semibold">Last 30 days</th>
                    <th className="px-5 pb-2 text-right font-semibold">{canEdit ? '' : 'Changed'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const on = editing === r.id && draft;
                    const im = impact(r, on ? draft : null);
                    return (
                      <tr key={r.id} className={cx('border-t border-line align-middle', on && 'bg-brand-soft')}>
                        <td className="t-small-strong px-5 py-3">
                          {TEST[r.test].name} <span className="font-normal text-muted">{TEST[r.test].unit}</span>
                        </td>
                        <td className="t-data py-3">{on ? <input id={`min-${r.id}`} aria-label="Lower limit" className={input} value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} /> : (r.min ?? '–')}</td>
                        <td className="t-data py-3">{on ? <input id={`max-${r.id}`} aria-label="Upper limit" className={input} value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} /> : (r.max ?? '–')}</td>
                        <td className="py-3">
                          {on ? (
                            <select id={`sev-${r.id}`} aria-label="Severity" className="t-small h-9 rounded-[8px] border border-line-strong bg-raised px-2" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}>
                              {(Object.keys(SEVERITY) as Severity[]).map((k) => (
                                <option key={k} value={k}>
                                  {SEVERITY[k].word}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <SeverityBadge level={r.severity} />
                          )}
                        </td>
                        <td className="t-small py-3">
                          {on ? (
                            <span className="block pr-3">
                              {im.next} of {im.total} would fail <span className={cx('block', im.next > im.now ? 'text-critical' : im.next < im.now ? 'text-ok' : 'text-muted')}>(now {im.now})</span>
                            </span>
                          ) : (
                            <span className="text-muted">
                              {im.now} of {im.total} failed
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {canEdit ? (
                            on ? (
                              <span className="flex justify-end gap-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (dropping !== r.id) return setDropping(r.id);
                                    dispatch({ type: 'rule/remove', ruleId: r.id, by: user.id } as never);
                                    setEditing(null);
                                    setDropping(null);
                                    setRemoved(`Removed the ${TEST[r.test].name} limit from ${p.name}.`);
                                  }}
                                  className={cx('t-small-strong h-9 rounded-full px-3', dropping === r.id ? 'bg-critical text-on-critical hover:bg-[var(--critical-hover)]' : 'text-critical hover:bg-critical-soft')}
                                >
                                  {dropping === r.id ? 'Confirm remove' : 'Remove'}
                                </button>
                                <button type="button" onClick={() => setEditing(null)} className="t-small-strong h-9 rounded-full border border-line px-3 hover:bg-sunken">
                                  Cancel
                                </button>
                                <button type="button" onClick={() => save(r)} className="t-small-strong h-9 rounded-full bg-brand px-4 text-on-brand hover:bg-[var(--brand-hover)]">
                                  Save
                                </button>
                              </span>
                            ) : (
                              <button type="button" onClick={() => start(r)} className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken">
                                {saved === r.id ? 'Saved · Edit' : 'Edit'}
                              </button>
                            )
                          ) : (
                            <span className="t-small text-muted">
                              {dayMonth(r.updatedAt)} · {userName(s, r.updatedBy).split(' ')[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && editing && rules.some((r) => r.id === editing) && <p className="t-small mt-3 text-critical">{error}</p>}
          </Panel>
        );
      })}
    </section>
  );
}

// ---------- Account ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export function AccountPage() {
  const s = useMillState();
  const now = useNow();
  const me = useUser('dash');
  const here = shiftAt(now);
  const [viewing, setViewing] = useState<string | null>(null);
  // Details come from the stored user, filled in from the seed for older saved states.
  const profileOf = (id: string) => {
    const u = s.users.find((x) => x.id === id) ?? me;
    return { ...USERS.find((x) => x.id === u.id), ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) } as User;
  };
  const user = profileOf(viewing ?? me.id);
  const isMe = user.id === me.id;
  const [prefs, setPrefs] = useState({ sound: true, escalations: true, daily: false, weekly: true });
  const roles = ['operator', 'supervisor', 'tester', 'fitter', 'qc', 'plant'] as const;
  const shifts: ShiftId[] = ['A', 'B', 'C'];
  const HOURS: Record<ShiftId, string> = { A: '06:00–14:00', B: '14:00–22:00', C: '22:00–06:00' };
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHead title="Account" sub="Your profile, the people on the floor and how you get notified" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel
          title={isMe ? 'Your profile' : 'Profile'}
          aside={
            !isMe ? (
              <button type="button" onClick={() => setViewing(null)} className="t-small-strong h-8 shrink-0 rounded-full border border-line px-3 hover:bg-sunken">
                Back to mine
              </button>
            ) : undefined
          }
        >
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-[18px] font-semibold text-brand-text">{user.name.split(' ').map((p) => p[0]).join('')}</span>
            <div>
              <p className="t-section">{user.name}</p>
              <p className="t-small text-muted">
                {ROLE_WORD[user.role]} · {user.shift === 'G' ? 'Day shift (office hours)' : `${user.shift} shift`}
              </p>
            </div>
          </div>
          <dl className="t-small mt-5 grid grid-cols-2 gap-x-4 gap-y-3.5">
            {(
              [
                ['Email', user.email ? <a href={`mailto:${user.email}`} className="break-all text-brand-text hover:underline">{user.email}</a> : undefined],
                ['Phone', user.phone],
                ['Gender', user.gender],
                ['Employee ID', user.empId],
                ['Department', user.department],
                ['Reports to', user.reportsTo ? `${userName(s, user.reportsTo)} (${ROLE_WORD[profileOf(user.reportsTo).role]})` : user.role === 'plant' ? 'Mill management' : undefined],
                ['Joined', user.joined ? monthYear(user.joined) : undefined],
                ['Languages', user.languages?.join(', ')],
                ['Frames', user.frames ? `Frames ${user.frames[0]}–${user.frames[1]}` : 'Whole floor'],
                ['Can change rules', user.role === 'qc' ? 'Yes' : 'No'],
              ] as [string, ReactNode][]
            ).filter(([k]) => k !== 'Frames' || user.role === 'supervisor' || user.role === 'operator').map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted">{k}</dt>
                <dd className="t-small-strong">{v ?? 'Not added'}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Notifications" sub="Preview only, saved on this screen until accounts go live">
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {[
              ['sound', 'Alert sound on the phone', 'Full-screen alerts ring even on silent'],
              ['escalations', 'Escalations to me', 'When nobody has seen an alert in time'],
              ['daily', 'Daily summary', 'Every morning at 08:00'],
              ['weekly', 'Weekly report', 'Mondays, with top causes and yarn saved'],
            ].map(([k, label, hint]) => {
              const on = prefs[k as keyof typeof prefs];
              return (
                <li key={k} className="flex items-center justify-between gap-4 py-3">
                  <span>
                    <span className="t-small-strong block">{label}</span>
                    <span className="t-small text-muted">{hint}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => setPrefs({ ...prefs, [k]: !on })}
                    className={cx('relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors duration-200', on ? 'bg-brand' : 'bg-[var(--line-strong)]')}
                  >
                    <span aria-hidden className={cx('absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200', on ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Shifts and roster" sub="Alerts go to the role on shift, not to a person">
        <div className="grid gap-3 md:grid-cols-3">
          {shifts.map((sh) => {
            const people = s.users.filter((u) => u.shift === sh);
            return (
              <div key={sh} className={cx('rounded-[10px] border p-4', sh === here ? 'border-[var(--ok)] bg-ok-soft' : 'border-line')}>
                <div className="flex items-center justify-between">
                  <span className="t-body-strong">{sh} shift</span>
                  <span className={cx('t-small', sh === here ? 't-small-strong text-ok' : 'text-muted')}>{sh === here ? 'On now' : HOURS[sh]}</span>
                </div>
                <ul className="t-small mt-3 flex flex-col gap-1.5">
                  {people.map((u) => (
                    <li key={u.id} className="flex justify-between gap-2">
                      <span>{u.name}</span>
                      <span className="text-muted">{ROLE_WORD[u.role]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="People and roles" sub={`${s.users.length} people`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const people = s.users.filter((u) => u.role === r);
            return (
              <div key={r}>
                <p className="t-label mb-2 text-[10px] text-muted">
                  {ROLE_WORD[r]} · {people.length}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {people.map((u) => (
                    <li key={u.id}>
                      <button type="button" onClick={() => { setViewing(u.id); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`See ${u.name}'s details`} className="group flex w-full items-center gap-2.5 text-left">
                        <span className="grid size-7 place-items-center rounded-full bg-sunken text-[10px] font-semibold">{u.name.split(' ').map((p) => p[0]).join('')}</span>
                        <span className={cx('t-small flex-1 group-hover:underline', user.id === u.id && !isMe && 't-small-strong')}>{u.name}</span>
                        <span className="t-small text-muted">{u.shift === 'G' ? 'Day' : `${u.shift} shift`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
