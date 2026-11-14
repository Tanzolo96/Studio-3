import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MillState, Ticket, User } from '../engine/types';
import { escalation, takeoversFor } from '../engine/selectors';
import { covers, frameWord, limitFor } from '../engine/reducer';
import { hhmm } from '../engine/time';
import { Button, cx, SeverityShape } from '../ui/primitives';
import { ReadingGauge, ResponseTimer } from '../ui/cards';
import { playCritical, playMajor } from '../ui/sound';
import { useDispatch } from '../store/store';
import { useT } from './i18n';

/** Full-screen alert over any tab. The only way out is "Seen, I'm on it". */
/** Pop-ups put away with "Later" (or opened by the plant head). They stay away until the alert climbs to the next level. */
const acknowledged = new Set<string>();
const takeoverKey = (t: Ticket, now: number) => `${t.id}:${t.alertAt}:${escalation(t, now).level}`;

export function TakeoverLayer({ s, user, now }: { s: MillState; user: User; now: number }) {
  const [, redraw] = useState(0);
  const list = takeoversFor(s, user, now).filter((x) => !acknowledged.has(`${user.id}|${takeoverKey(x, now)}`));
  const t = list[0];
  const played = useRef(new Set<string>());
  const key = t ? `${t.id}:${t.alertAt}:${escalation(t, now).level}` : '';

  useEffect(() => {
    if (!t) return;
    if (!played.current.has(key)) {
      played.current.add(key);
      (t.severity === 'critical' ? playCritical : playMajor)();
    }
    if (t.severity !== 'critical') return;
    const id = window.setInterval(playCritical, 4000);
    return () => window.clearInterval(id);
  }, [key, t]);

  if (!t) return null;
  return <Takeover s={s} t={t} user={user} now={now} more={list.length - 1} onLater={() => { acknowledged.add(`${user.id}|${takeoverKey(t, now)}`); redraw((n) => n + 1); }} />;
}

function Takeover({ s, t, user, now, more, onLater }: { s: MillState; t: Ticket; user: User; now: number; more: number; onLater: () => void }) {
  const tr = useT();
  const dispatch = useDispatch();
  const nav = useNavigate();
  const esc = escalation(t, now);
  const product = s.products.find((p) => p.id === t.productId)!;
  const reading = t.readings.at(-1);
  const rule = reading && t.kind === 'test_fail' ? limitFor(s, t.productId, reading) : undefined;
  const critical = t.severity === 'critical';
  const done = t.events.filter((e) => e.kind === 'contained' && e.at >= t.alertAt - 1).map((e) => e.text);
  const escalatedToMe = user.role !== 'supervisor' || !covers(user, t.frameId);
  const asBackup = user.role === 'supervisor' && escalatedToMe;
  const title = t.kind === 'drift' ? `Winding drift on ${frameWord(t.frameId)}` : t.title;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), [t.id]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="takeover-title"
      className={cx('absolute inset-0 z-[var(--z-takeover)] flex flex-col overflow-y-auto bg-raised', 'anim-rise')}
    >
      <header className={cx('px-5 pt-10 pb-5', critical ? 'bg-critical text-on-critical' : 'bg-major-soft text-ink')}>
        <p className="t-label flex items-center gap-1.5">
          <span className={cx('grid size-4 place-items-center rounded-[6px]', critical ? 'bg-[var(--on-critical)]' : '')}>
            <SeverityShape level={t.severity} size={10} />
          </span>
          {escalatedToMe ? `${tr(asBackup ? 'Backup: not seen in 5 min' : 'Escalated to you')} · ${hhmm(t.alertAt + (asBackup ? t.seenMins : esc.level >= 2 ? t.escalatePhMins : t.escalateQcMins) * 60_000)}` : `${tr(critical ? 'Critical alert' : 'Major alert')} · ${hhmm(t.alertAt)}`}
        </p>
        <h1 id="takeover-title" className="t-alert mt-2">
          {title}
        </h1>
        <p className="t-body mt-1">
          {tr('{frame} · Lot {lot} · {yarn} yarn', { frame: frameWord(t.frameId), lot: t.lotId, yarn: product.short })}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {reading && (
          <ReadingGauge
            test={reading.test}
            value={reading.value}
            min={t.kind === 'test_fail' ? rule?.min : undefined}
            max={t.kind === 'test_fail' ? rule?.max : reading.max}
            drift={t.kind !== 'test_fail' && reading.test === 'cv'}
          />
        )}
        {(done.length > 0 || escalatedToMe) && (
          <div>
            <p className="t-small-strong text-muted">Already done</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {escalatedToMe && (
                <li className="t-small flex gap-2">
                  <span aria-hidden>•</span>
                  {tr('Not seen by the {shift} shift supervisor for {n} min', { shift: t.shift, n: Math.floor(esc.elapsed / 60000) })}
                </li>
              )}
              {done.map((d) => (
                <li key={d} className="t-small flex gap-2">
                  <span aria-hidden>•</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ResponseTimer elapsed={esc.elapsed} limitMins={t.seenMins} state={esc.timer} level={esc.level} />
        <div className="mt-auto flex flex-col gap-2 pb-2">
          {more > 0 && <p className="t-small text-center text-muted">{tr('{n} more alerts after this one', { n: more })}</p>}
          <Button
            ref={btn}
            size="lg"
            block
            variant={critical ? 'danger' : 'primary'}
            onClick={() => {
              if (user.role === 'plant') acknowledged.add(`${user.id}|${takeoverKey(t, now)}`);
              else dispatch({ type: 'ticket/working', ticketId: t.id, by: user.id });
              nav(`/app/ticket/${t.id}`);
            }}
          >
            {tr(user.role === 'plant' ? 'See who is on it' : 'I’m fixing it')}
          </Button>
          {escalatedToMe && (
            <Button size="lg" block variant="secondary" onClick={onLater}>
              {tr('Later')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
