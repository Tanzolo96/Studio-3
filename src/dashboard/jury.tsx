// Jury setup: put two phones and this laptop in one live room, show who is connected, reset between runs.
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@carbon/icons-react';
import { useMill, useMillState, useTheme } from '../store/store';
import { currentRoom, liveReady, useLive } from '../store/live';
import { ROLE_WORD } from '../app/Person';
import { cx } from '../ui/primitives';
import { PageHead } from './DashShell';
import { Panel } from './Overview';

const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

/** A link that opens this site as one person, in this room. */
function link(room: string, part: 'app' | 'dashboard', who: string) {
  const q = `room=${room}&${part === 'app' ? 'as' : 'dash'}=${who}`;
  return STANDALONE ? `${location.origin}${location.pathname}?${q}#${part}` : `${location.origin}/${part}?${q}`;
}

function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label="QR code" className="rounded-[8px] bg-white">
      <path d={path.d} fill="#000" />
    </svg>
  );
}

const switchRoom = (room: string | null) => {
  try {
    if (room) localStorage.setItem('qc.room', room);
    else localStorage.removeItem('qc.room');
  } catch {
    /* storage blocked */
  }
  location.reload();
};

/** The jury page stands apart from the dashboard: its own plain page, with a way into the dashboard and back to the start. */
export function JuryPage() {
  const theme = useTheme('dash');
  return (
    <div data-theme={theme} className="min-h-dvh bg-surface text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <Link to="/" className="t-small-strong flex items-center gap-2 text-muted hover:text-ink">
          <ArrowLeft size={16} /> Start screen
        </Link>
        <span className="t-body-strong">QC Alert · Jury demo</span>
        <Link to="/dashboard" className="t-small-strong h-10 rounded-full bg-brand px-5 leading-10 text-on-brand hover:bg-[var(--brand-hover)]">
          Open dashboard
        </Link>
      </header>
      <main className="px-6 py-8">
        <JuryBody />
      </main>
    </div>
  );
}

function JuryBody() {
  const s = useMillState();
  const reset = useMill((x) => x.reset);
  const live = useLive();
  const room = currentRoom();
  const [copied, setCopied] = useState('');
  const [confirm, setConfirm] = useState(false);
  const name = (id: string) => s.users.find((u) => u.id === id);
  const devices = live.peers.map((p) => {
    const [id, kind] = p.who.split('|');
    const u = name(id);
    return { key: p.id, label: u ? `${u.name}, ${ROLE_WORD[u.role]}` : id, kind };
  });

  if (!liveReady())
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHead title="Jury demo" sub="Live sync is not set up in this build." />
      </div>
    );

  const roles = [
    { who: 'ramesh', part: 'app' as const, title: 'Phone 1 · Ramesh', job: 'Machine operator, frames 1–12. Raises the ticket.' },
    { who: 'krish', part: 'app' as const, title: 'Phone 2 · Krish', job: 'Shift supervisor, frames 1–12. Gets the alert, fixes it.' },
    { who: 'priya', part: 'dashboard' as const, title: 'Laptop · Priya', job: 'QC manager dashboard. Shows every step live.' },
  ];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHead title="Jury demo" sub="Two phones and this laptop share one live mill. Scan a code with each phone." />

      <Panel
        title="Live room"
        sub={room ? 'Everything done on a device in this room shows on the others within a second.' : 'Start a room, then scan the codes with the phones.'}
        aside={
          room ? (
            <span className={cx('t-small-strong flex items-center gap-2 rounded-full px-3 py-1', live.state === 'live' ? 'bg-ok-soft text-ok' : live.state === 'offline' ? 'bg-critical-soft text-critical' : 'bg-sunken text-muted')}>
              <span className={cx('size-2 rounded-full', live.state === 'live' ? 'bg-ok' : live.state === 'offline' ? 'bg-critical' : 'bg-[var(--line-strong)]')} />
              {live.state === 'live' ? 'Connected' : live.state === 'offline' ? 'Offline, retrying' : 'Connecting'}
            </span>
          ) : undefined
        }
      >
        {room ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="t-label text-[10px] text-muted">Room</p>
              <p className="t-stat">{room}</p>
              <p className="t-small mt-2 text-muted">
                {devices.length} device{devices.length === 1 ? '' : 's'} connected
                {devices.length ? `: ${devices.map((d) => `${d.label} (${d.kind})`).join(' · ')}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirm ? (
                <>
                  <span className="t-small self-center text-muted">Clear every ticket raised in this room, on every device?</span>
                  <button type="button" onClick={() => setConfirm(false)} className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken">
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      setConfirm(false);
                    }}
                    className="t-small-strong h-10 rounded-full bg-critical px-4 text-on-critical hover:bg-[var(--critical-hover)]"
                  >
                    Reset demo
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirm(true)} className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken">
                    Reset demo
                  </button>
                  <button type="button" onClick={() => switchRoom(null)} className="t-small-strong h-10 rounded-full border border-line px-4 text-muted hover:bg-sunken">
                    Leave room
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => switchRoom(`jury-${Math.floor(1000 + Math.random() * 9000)}`)}
            className="t-small-strong h-11 rounded-full bg-brand px-6 text-on-brand hover:bg-[var(--brand-hover)]"
          >
            Start a jury room
          </button>
        )}
      </Panel>

      {room && (
        <div className="grid gap-4 md:grid-cols-3">
          {roles.map((r) => {
            const url = link(room, r.part, r.who);
            const on = devices.some((d) => d.label.toLowerCase().startsWith(name(r.who)?.name.toLowerCase() ?? '-'));
            return (
              <Panel key={r.who} title={r.title} sub={r.job} aside={on ? <span className="t-small-strong text-ok">Connected</span> : undefined}>
                <div className="flex flex-col items-center gap-3">
                  <Qr text={url} />
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(url);
                      setCopied(r.who);
                    }}
                    className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken"
                  >
                    {copied === r.who ? 'Link copied' : 'Copy link'}
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="How the run goes">
        <ol className="t-body flex list-decimal flex-col gap-2 pl-5">
          <li>Ramesh (phone 1) taps <b>Raise ticket</b>, picks a frame from 1 to 12, the problem, and sends it.</li>
          <li>The alert appears here on the dashboard straight away, and the message goes to Krish.</li>
          <li>Krish (phone 2) gets the full-screen alert with sound and taps <b>I’m fixing it</b>. The dashboard shows “Krish is fixing”.</li>
          <li>Krish taps <b>Fixed</b> and answers the short report: part, problem, yarn made since the last good test. The dashboard shows it fixed, with the report and every message.</li>
          <li>Press <b>Reset demo</b> before the next jury group.</li>
        </ol>
        <p className="t-small mt-4 text-muted">
          On each phone: open the link, tap the screen once so the alert sound is allowed, keep the screen on. iPhone: turn the silent switch off. Phones need internet (Wi-Fi or mobile data).
        </p>
      </Panel>
    </div>
  );
}
