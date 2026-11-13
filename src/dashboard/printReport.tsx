// The Monthly report as a printed document (Download PDF). Hidden on screen; only this prints.
// Structure follows a standard monthly quality review: summary, KPIs against target, where the faults were,
// how fast people responded, the full alert log, actions for next month, sign-off.
import type { MillState, Ticket } from '../engine/types';
import { DAY, dayMonth, hhmm, mill, millDayKey } from '../engine/time';
import { median } from '../engine/selectors';
import { userName, withUnit } from '../engine/reducer';
import { TEST } from '../engine/vocab';

const toOwn = (t: Ticket) => ((t.seenAt ?? t.workingAt) !== undefined ? ((t.seenAt ?? t.workingAt)! - t.alertAt) / 60000 : undefined);
const fixMins = (t: Ticket) => (t.fixedAt && (t.workingAt ?? t.seenAt) ? (t.fixedAt - (t.workingAt ?? t.seenAt)!) / 60000 : undefined);
const mmss = (m?: number) => (m === undefined ? '–' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`);
const mins = (m?: number) => (m === undefined ? '–' : `${Math.round(m)} min`);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const nums = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined);
const mode = (xs: (string | undefined)[]) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0];
};
const status = (t: Ticket) => (t.closeReason === 'sample_error' ? 'False alarm' : t.status === 'closed' ? 'Closed' : t.status === 'fixed' ? 'Re-test due' : 'Open');

export function PrintReport({ s, now }: { s: MillState; now: number }) {
  const end = mill(millDayKey(now)) + DAY;
  const start = end - 30 * DAY;
  const prevStart = start - 30 * DAY;
  const inRange = (a: number, b: number) => s.tickets.filter((t) => t.severity !== 'minor' && t.createdAt >= a && t.createdAt < b && t.createdAt <= now).sort((x, y) => x.createdAt - y.createdAt);
  const alerts = inRange(start, end);
  // Compare with last month only when the record goes back that far.
  const first = Math.min(...s.tickets.map((t) => t.createdAt));
  const hasPrev = first <= prevStart + 2 * DAY;
  const prev = hasPrev ? inRange(prevStart, start) : [];
  const crit = alerts.filter((t) => t.severity === 'critical').length;
  const falseAlarms = alerts.filter((t) => t.closeReason === 'sample_error').length;
  const own = nums(alerts.map(toOwn));
  const ownPrev = nums(prev.map(toOwn));
  const onTime = own.filter((m) => m <= 5).length;
  const fix = nums(alerts.map(fixMins));
  const open = alerts.filter((t) => t.status !== 'closed');
  const confirmed = alerts.filter((t) => t.fixConfirmedAt).length;
  const kg = alerts.reduce((n, t) => n + (t.affectedKg ?? 0), 0);

  const frameRows = [...new Set(alerts.map((t) => t.frameId))]
    .map((f) => {
      const list = alerts.filter((t) => t.frameId === f);
      return { f, n: list.length, cause: mode(list.map((t) => t.cause)), part: mode(list.map((t) => t.part)), last: list.at(-1)!.createdAt };
    })
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, 6);
  const causeRows = (() => {
    const c = new Map<string, number>();
    for (const t of alerts) c.set(t.cause ?? (t.closeReason === 'sample_error' ? 'False alarm (sample)' : 'Not reported yet'), (c.get(t.cause ?? (t.closeReason === 'sample_error' ? 'False alarm (sample)' : 'Not reported yet')) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const shiftRows = (['A', 'B', 'C'] as const).map((sh) => {
    const list = alerts.filter((t) => t.shift === sh);
    const o = nums(list.map(toOwn));
    return { sh, n: list.length, own: median(o), onTime: o.filter((m) => m <= 5).length, of: o.length, fix: median(nums(list.map(fixMins))) };
  });

  // Findings and actions are written from the numbers, so the PDF reads on its own.
  const findings: string[] = [];
  const topF = frameRows[0];
  if (topF && topF.n >= 2) findings.push(`${topF.f} had ${topF.n} alerts${topF.cause ? `, most often caused by ${topF.cause[0].toLowerCase()}` : ''}${topF.part ? ` in the ${topF.part[0].toLowerCase()}` : ''}.`);
  const slow = [...shiftRows].filter((r) => r.own !== undefined).sort((a, b) => (b.own ?? 0) - (a.own ?? 0))[0];
  if (slow && (slow.own ?? 0) > 5) findings.push(`${slow.sh} shift took a median ${mmss(slow.own)} to start fixing, over the 5:00 limit.`);
  findings.push(`${pct(onTime, own.length)} of alerts were picked up within 5 minutes (${onTime} of ${own.length}).`);
  if (causeRows[0]) findings.push(`Top cause: ${causeRows[0][0].toLowerCase()} (${causeRows[0][1]} of ${alerts.length} alerts).`);
  const actions: { what: string; who: string }[] = [];
  for (const r of frameRows.filter((r) => r.n >= 3)) actions.push({ what: `Review ${r.f}: ${r.n} alerts in 30 days${r.cause ? `, ${r.cause[0].toLowerCase()} ${r.cause[1]}×` : ''}. Decide overhaul or a fix to how it is run.`, who: 'Plant head with maintenance' });
  if (slow && (slow.own ?? 0) > 5) actions.push({ what: `Check backup supervisor cover on ${slow.sh} shift; median response ${mmss(slow.own)}.`, who: 'QC manager' });
  if (open.length) actions.push({ what: `Close ${open.length} open alert${open.length === 1 ? '' : 's'} (${open.map((t) => t.frameId).join(', ')}).`, who: 'Shift supervisors' });
  if (!actions.length) actions.push({ what: 'No repeat frames or late shifts this month. Keep the current limits.', who: 'QC manager' });

  const priya = s.users.find((u) => u.role === 'qc');
  const mohit = s.users.find((u) => u.role === 'plant');
  const ref = `QCR-${new Date(now + 5.5 * 3600000).getUTCFullYear()}-${String(new Date(now + 5.5 * 3600000).getUTCMonth() + 1).padStart(2, '0')}`;
  const delta = (a?: number, b?: number) => (a === undefined || b === undefined ? '' : a < b ? `▼ ${mmss(b - a)} faster` : a > b ? `▲ ${mmss(a - b)} slower` : 'same');

  return (
    <article className="qcr print-only" aria-hidden>
      <header className="qcr-head">
        <div>
          <p className="qcr-kicker">QC Alert · Monthly quality report</p>
          <h1>Ring spinning · Frames 1–24</h1>
          <p className="qcr-sub">
            {dayMonth(start)} – {dayMonth(end - DAY)} {new Date(end - DAY + 5.5 * 3600000).getUTCFullYear()} · critical and major alerts
          </p>
        </div>
        <table className="qcr-meta">
          <tbody>
            <tr><th>Report</th><td>{ref}</td></tr>
            <tr><th>Prepared by</th><td>{priya?.name} · QC manager</td></tr>
            <tr><th>For</th><td>{mohit?.name} · Plant head</td></tr>
            <tr><th>Issued</th><td>{dayMonth(now)}, {hhmm(now)}</td></tr>
          </tbody>
        </table>
      </header>

      <section>
        <h2>1. Summary</h2>
        <p className="qcr-lead">
          {alerts.length} critical and major alerts this month ({crit} critical){hasPrev ? `, against ${prev.length} the month before` : ''}. Median time from alert to “I’m fixing” was{' '}
          <b>{mmss(median(own))}</b> against a 5:00 limit, and {pct(onTime, own.length)} were picked up in time. {confirmed} fixes were confirmed by a lab re-test; {open.length} alert{open.length === 1 ? ' is' : 's are'} still open.
        </p>
        <table className="qcr-table qcr-kpi">
          <thead>
            <tr><th>Measure</th><th>This month</th><th>Last month</th><th>Target</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>Critical and major alerts</td><td>{alerts.length}</td><td>{hasPrev ? prev.length : 'No record'}</td><td>Fewer</td><td className={hasPrev ? (alerts.length <= prev.length ? 'ok' : 'bad') : ''}>{hasPrev ? (alerts.length <= prev.length ? 'Better' : 'Worse') : 'First month on record'}</td></tr>
            <tr><td>Median time to “I’m fixing”</td><td>{mmss(median(own))}</td><td>{mmss(median(ownPrev))}</td><td>≤ 5:00</td><td className={(median(own) ?? 0) <= 5 ? 'ok' : 'bad'}>{(median(own) ?? 0) <= 5 ? 'On target' : 'Over'} {delta(median(own), median(ownPrev)) && `· ${delta(median(own), median(ownPrev))}`}</td></tr>
            <tr><td>Alerts picked up within 5 min</td><td>{pct(onTime, own.length)}</td><td>{hasPrev ? pct(ownPrev.filter((m) => m <= 5).length, ownPrev.length) : '–'}</td><td>≥ 90%</td><td className={own.length && onTime / own.length >= 0.9 ? 'ok' : 'bad'}>{own.length && onTime / own.length >= 0.9 ? 'On target' : 'Below'}</td></tr>
            <tr><td>Median fixing time</td><td>{mins(median(fix))}</td><td>{mins(median(nums(prev.map(fixMins))))}</td><td>–</td><td>From {fix.length} fix reports</td></tr>
            <tr><td>Fixes confirmed by re-test</td><td>{confirmed} of {alerts.length - falseAlarms}</td><td>–</td><td>All</td><td className={confirmed >= alerts.length - falseAlarms - open.length ? 'ok' : 'bad'}>{open.length} open</td></tr>
            <tr><td>False alarms (bad lab sample)</td><td>{falseAlarms}</td><td>{hasPrev ? prev.filter((t) => t.closeReason === 'sample_error').length : '–'}</td><td>–</td><td>–</td></tr>
            <tr><td>Yarn made before the fix (reported)</td><td>{kg ? `about ${Math.round(kg / 10) * 10} kg` : '–'}</td><td>–</td><td>Less</td><td>From fix reports</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>2. Key findings</h2>
        <ol className="qcr-list">{findings.map((f) => <li key={f}>{f}</li>)}</ol>
      </section>

      <section className="qcr-two">
        <div>
          <h2>3. Frames with most alerts</h2>
          <table className="qcr-table">
            <thead><tr><th>Frame</th><th>Alerts</th><th>Main cause</th><th>Part</th><th>Last</th></tr></thead>
            <tbody>
              {frameRows.map((r) => (
                <tr key={r.f}><td><b>{r.f}</b></td><td>{r.n}</td><td>{r.cause?.[0] ?? '–'}</td><td>{r.part?.[0] ?? '–'}</td><td>{dayMonth(r.last)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2>4. Causes</h2>
          <table className="qcr-table">
            <thead><tr><th>Cause</th><th>Alerts</th><th>Share</th></tr></thead>
            <tbody>
              {causeRows.map(([c, n]) => (
                <tr key={c}>
                  <td>{c}</td><td>{n}</td>
                  <td><span className="qcr-bar"><span style={{ width: `${(n / alerts.length) * 100}%` }} /></span> {pct(n, alerts.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>5. Response by shift</h2>
        <table className="qcr-table">
          <thead><tr><th>Shift</th><th>Hours</th><th>Alerts</th><th>Median to “I’m fixing”</th><th>Within 5 min</th><th>Median fixing time</th></tr></thead>
          <tbody>
            {shiftRows.map((r) => (
              <tr key={r.sh}>
                <td><b>{r.sh}</b></td><td>{({ A: '06–14', B: '14–22', C: '22–06' } as const)[r.sh]}</td><td>{r.n}</td>
                <td className={(r.own ?? 0) > 5 ? 'bad' : ''}>{mmss(r.own)}</td><td>{r.of ? `${r.onTime} of ${r.of}` : '–'}</td><td>{mins(r.fix)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="qcr-break">
        <h2>6. Alert log</h2>
        <p className="qcr-note">Every critical and major alert of the period, oldest first. Times are minutes from the alert.</p>
        <table className="qcr-table qcr-log">
          <thead>
            <tr><th>When</th><th>Frame</th><th>Failed test</th><th>Sev.</th><th>Owner</th><th>To “I’m fixing”</th><th>Fixing</th><th>Cause · part</th><th>Status</th></tr>
          </thead>
          <tbody>
            {alerts.map((t) => {
              const r = t.readings[0];
              const o = toOwn(t);
              return (
                <tr key={t.id}>
                  <td>{dayMonth(t.createdAt)} {hhmm(t.createdAt)}</td>
                  <td><b>{t.frameId}</b></td>
                  <td>{t.test ? TEST[t.test].name : t.title}{r ? ` ${withUnit(r.test, r.value)}` : ''}</td>
                  <td>{t.severity === 'critical' ? 'Crit.' : 'Major'}</td>
                  <td>{t.seenBy ? userName(s, t.seenBy).split(' ')[0] : '–'}</td>
                  <td className={(o ?? 0) > 5 ? 'bad' : ''}>{mmss(o)}</td>
                  <td>{mins(fixMins(t))}</td>
                  <td>{[t.cause, t.part].filter(Boolean).join(' · ') || '–'}</td>
                  <td>{status(t)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>7. Actions for next month</h2>
        <table className="qcr-table">
          <thead><tr><th style={{ width: '6%' }}>#</th><th>Action</th><th style={{ width: '26%' }}>Owner</th><th style={{ width: '14%' }}>Due</th></tr></thead>
          <tbody>
            {actions.map((x, i) => (
              <tr key={x.what}><td>{i + 1}</td><td>{x.what}</td><td>{x.who}</td><td>{dayMonth(end + 14 * DAY)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="qcr-sign">
        <div><span />Reviewed by · QC manager<br /><b>{priya?.name}</b></div>
        <div><span />Approved by · Plant head<br /><b>{mohit?.name}</b></div>
        <div><span />Date</div>
      </section>

      <footer className="qcr-foot">Generated by QC Alert from the alert record. Limits and escalation times as set on the Rules page on the issue date.</footer>
    </article>
  );
}
