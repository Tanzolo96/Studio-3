// Messages: QC Alert as the go-between. Every alert it sent, to whom, how, and every answer from the floor.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMillState, useNow } from '../store/store';
import { messagesFor, waitingOn } from '../engine/selectors';
import { DAY, dayMonth, sameMillDay, timer } from '../engine/time';
import { cx, SeverityShape } from '../ui/primitives';
import { PageHead } from './DashShell';
import { Panel } from './Overview';
import { MessageList } from './Live';

export function MessagesPage() {
  const s = useMillState();
  const now = useNow();
  const [who, setWho] = useState('all');
  const [days, setDays] = useState(1);
  const live = s.tickets.filter((t) => t.status !== 'closed' && t.severity !== 'minor');
  const all = useMemo(
    () =>
      s.tickets
        .filter((t) => now - t.createdAt < days * DAY)
        .flatMap((t) => messagesFor(s, t, now).map((m) => ({ ...m, t })))
        .filter((m) => m.at <= now && (who === 'all' || m.who.startsWith(who)))
        .sort((a, b) => b.at - a.at),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, Math.floor(now / 30000), who, days],
  );
  const groups: { day: string; items: typeof all }[] = [];
  for (const m of all) {
    const d = sameMillDay(m.at, now) ? 'Today' : dayMonth(m.at);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, items: [] });
    groups.at(-1)!.items.push(m);
  }
  const people = [...new Set(s.users.map((u) => u.name))];
  const select = 't-small h-10 rounded-full border border-line bg-raised px-4';

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <PageHead title="Messages" sub="QC Alert sends each alert to the right person and moves it up when nobody answers. Every message and answer is kept here." />

      <Panel title="Waiting on right now" sub={live.length ? `${live.length} open alert${live.length > 1 ? 's' : ''}` : 'Nobody: no open alerts'}>
        {live.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {live.map((t) => (
              <li key={t.id}>
                <Link to={`/dashboard/tickets/${t.id}`} className="grid grid-cols-[14px_56px_minmax(0,1fr)_auto] items-center gap-2 py-2.5 hover:bg-sunken">
                  <SeverityShape level={t.severity} />
                  <span className="t-small-strong">{t.frameId}</span>
                  <span className="t-small">{waitingOn(s, t, now)}</span>
                  <span className="t-data text-[12px] text-muted">open {timer(now - t.alertAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small text-muted">When an alert is open, this shows who QC Alert is waiting on.</p>
        )}
      </Panel>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        <select aria-label="Person" className={select} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div role="radiogroup" aria-label="Period" className="flex rounded-full border border-line bg-raised p-1">
          {[
            [1, 'Last 24 hours'],
            [7, 'Last 7 days'],
            [31, 'Last 31 days'],
          ].map(([d, w]) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d as number)}
              className={cx('t-small-strong h-8 rounded-full px-3', days === d ? 'bg-ink text-[var(--surface-raised)]' : 'text-muted hover:text-ink')}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="t-small text-muted">No messages in this period.</p>}
      {groups.map((g) => (
        <Panel key={g.day} title={g.day} sub={`${g.items.length} message${g.items.length > 1 ? 's' : ''}`}>
          <MessageList items={g.items} showFrame />
        </Panel>
      ))}
    </div>
  );
}
