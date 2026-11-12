// Rules (QC manager edits, everyone else reads) and Account (profile, people, shifts, notifications).
import { useState } from 'react';
import type { Rule, Severity, ShiftId } from '../engine/types';
import { useDispatch, useMillState, useNow, useUser } from '../store/store';
import { withinRule, userName } from '../engine/reducer';
import { SEVERITY, TEST } from '../engine/vocab';
import { dayMonth, shiftAt } from '../engine/time';
import { cx, SeverityBadge } from '../ui/primitives';
import { ROLE_WORD } from '../app/Person';
import { PageHead } from './DashShell';
import { Panel } from './Overview';

// ---------- Rules ----------
type Draft = { min: string; max: string; severity: Severity; qc: string; ph: string };
const toNum = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function RulesPage() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const dispatch = useDispatch();
  const canEdit = user.role === 'qc';
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const since = now - 30 * 86_400_000;

  const start = (r: Rule) => {
    setEditing(r.id);
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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHead title="Rules" sub={canEdit ? 'Limits for each yarn and test. Changes apply to the next test result.' : 'Limits for each yarn and test. Only the QC manager can change them.'} />
      {s.products.map((p) => {
        const rules = s.rules.filter((r) => r.productId === p.id);
        if (!rules.length) return null;
        return (
          <Panel key={p.id} title={p.name} sub={`Nominal count ${p.nominalNe} Ne · winding sensor warns at CV +${p.cvWarnPct.toFixed(1)}%`}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="t-label text-[10px] text-muted">
                    <th className="px-5 pb-2 font-semibold">Test</th>
                    <th className="pb-2 font-semibold">Lower</th>
                    <th className="pb-2 font-semibold">Upper</th>
                    <th className="pb-2 font-semibold">Severity</th>
                    <th className="pb-2 font-semibold">To QC manager</th>
                    <th className="pb-2 font-semibold">To plant head</th>
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
                        <td className="t-data py-3">{on ? <input id={`qc-${r.id}`} aria-label="Minutes before the QC manager" className={input} value={draft.qc} onChange={(e) => setDraft({ ...draft, qc: e.target.value })} /> : `${r.escalateQcMins} min`}</td>
                        <td className="t-data py-3">{on ? <input id={`ph-${r.id}`} aria-label="Minutes before the plant head" className={input} value={draft.ph} onChange={(e) => setDraft({ ...draft, ph: e.target.value })} /> : `${r.escalatePhMins} min`}</td>
                        <td className="t-small py-3">
                          {on ? (
                            <span>
                              {im.next} of {im.total} would fail <span className={cx(im.next > im.now ? 'text-critical' : im.next < im.now ? 'text-ok' : 'text-muted')}>(now {im.now})</span>
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
                              <span className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditing(null)} className="t-small-strong h-9 rounded-full border border-line px-3 hover:bg-sunken">
                                  Cancel
                                </button>
                                <button type="button" onClick={() => save(r)} className="t-small-strong h-9 rounded-full bg-brand px-4 text-on-brand hover:bg-[var(--brand-hover)]">
                                  Save rule
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
    </div>
  );
}

// ---------- Account ----------
export function AccountPage() {
  const s = useMillState();
  const now = useNow();
  const user = useUser('dash');
  const here = shiftAt(now);
  const [prefs, setPrefs] = useState({ sound: true, escalations: true, daily: false, weekly: true });
  const roles = ['supervisor', 'tester', 'fitter', 'qc', 'plant'] as const;
  const shifts: ShiftId[] = ['A', 'B', 'C'];
  const HOURS: Record<ShiftId, string> = { A: '00:00–08:00', B: '08:00–16:00', C: '16:00–24:00' };
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHead title="Account" sub="Your profile, the people on the floor and how you get notified" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Your profile">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-[18px] font-semibold text-brand-text">{user.name.split(' ').map((p) => p[0]).join('')}</span>
            <div>
              <p className="t-section">{user.name}</p>
              <p className="t-small text-muted">
                {ROLE_WORD[user.role]} · {user.shift === 'G' ? 'Day shift (office hours)' : `${user.shift} shift`}
              </p>
            </div>
          </div>
          <dl className="t-small mt-5 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted">Phone</dt>
              <dd className="t-small-strong">{user.phone ?? 'Not added'}</dd>
            </div>
            <div>
              <dt className="text-muted">Can change rules</dt>
              <dd className="t-small-strong">{user.role === 'qc' ? 'Yes' : 'No'}</dd>
            </div>
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
                    className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-[var(--cell-off)]')}
                  >
                    <span className={cx('absolute top-0.5 size-5 rounded-full bg-raised shadow-raised transition-transform', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
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
                    <li key={u.id} className="flex items-center gap-2.5">
                      <span className="grid size-7 place-items-center rounded-full bg-sunken text-[10px] font-semibold">{u.name.split(' ').map((p) => p[0]).join('')}</span>
                      <span className="t-small flex-1">{u.name}</span>
                      <span className="t-small text-muted">{u.shift === 'G' ? 'Day' : `${u.shift} shift`}</span>
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
