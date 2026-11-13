// Jury setup: put two phones and this laptop in one live room, show who is connected, reset between runs.
import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Link } from "react-router-dom";
import { ArrowLeft } from "@carbon/icons-react";
import { useMill, useMillState, useNow, useTheme } from "../store/store";
import { hhmm } from "../engine/time";
import { currentRoom, liveReady, useLive } from "../store/live";
import { ROLE_WORD } from "../app/Person";
import { cx } from "../ui/primitives";
import { PageHead } from "./DashShell";
import { Panel } from "./Overview";

const STANDALONE = import.meta.env.VITE_STANDALONE === "1";

/** A link that opens this site as one person, in this room. */
function link(room: string, part: "app" | "dashboard", who: string) {
  const q = `room=${room}&${part === "app" ? "as" : "dash"}=${who}`;
  return STANDALONE
    ? `${location.origin}${location.pathname}?${q}#${part}`
    : `${location.origin}/${part}?${q}`;
}

function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`}
      role="img"
      aria-label="QR code"
      className="rounded-[8px] bg-white"
    >
      <path d={path.d} fill="#000" />
    </svg>
  );
}

const switchRoom = (room: string | null) => {
  try {
    if (room) localStorage.setItem("qc.room", room);
    else localStorage.removeItem("qc.room");
  } catch {
    /* storage blocked */
  }
  location.reload();
};

/** The jury page stands apart from the dashboard: its own plain page, with a way into the dashboard and back to the start. */
export function JuryPage() {
  const theme = useTheme("dash");
  return (
    <div data-theme={theme} className="min-h-dvh bg-surface text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <Link
          to="/"
          className="t-small-strong flex items-center gap-2 text-muted hover:text-ink"
        >
          <ArrowLeft size={16} /> Start screen
        </Link>
        <span className="t-body-strong">QC Alert · Jury demo</span>
        <Link
          to="/dashboard"
          className="t-small-strong h-10 rounded-full bg-brand px-5 leading-10 text-on-brand hover:bg-[var(--brand-hover)]"
        >
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
  const now = useNow();
  const skip = useMill((x) => x.skip);
  const reset = useMill((x) => x.reset);
  const live = useLive();
  const room = currentRoom();
  const [copied, setCopied] = useState("");
  const [confirm, setConfirm] = useState(false);
  const name = (id: string) => s.users.find((u) => u.id === id);
  const devices = live.peers.map((p) => {
    const [id, kind] = p.who.split("|");
    const u = name(id);
    return {
      key: p.id,
      label: u ? `${u.name}, ${ROLE_WORD[u.role]}` : id,
      kind,
    };
  });

  if (!liveReady())
    return (
      <div className="mx-auto max-w-[900px]">
        <PageHead
          title="Jury demo"
          sub="Live sync is not set up in this build."
        />
      </div>
    );

  // Who is who in the run: the lab finds the fault, the frame's supervisor fixes it, and if nobody answers it climbs.
  const roles = [
    {
      who: "rohan",
      part: "app" as const,
      title: "Phone 1 · Rohan",
      job: "Lab tester. Reports the failed test.",
      must: true,
    },
    {
      who: "krish",
      part: "app" as const,
      title: "Phone 2 · Krish",
      job: "Supervisor of frames 1–12. Alerted first; fixes it.",
      must: true,
    },
    {
      who: "priya",
      part: "dashboard" as const,
      title: "Laptop · Priya",
      job: "QC manager. The dashboard shows every step; alerted after 10 min.",
      must: true,
    },
    {
      who: "farhan",
      part: "app" as const,
      title: "Phone 3 · Farhan",
      job: "Backup supervisor (frames 13–24). Alerted after 5 min.",
      must: false,
    },
    {
      who: "mohit",
      part: "app" as const,
      title: "Phone 4 · Mohit",
      job: "Plant head. Alerted and called after 20 min.",
      must: false,
    },
  ];
  const card = (r: (typeof roles)[number]) => {
    const url = link(room!, r.part, r.who);
    const on = devices.some((d) =>
      d.label.toLowerCase().startsWith(name(r.who)?.name.toLowerCase() ?? "-"),
    );
    return (
      <Panel
        key={r.who}
        title={r.title}
        sub={r.job}
        aside={
          on ? (
            <span className="t-small-strong text-ok">Connected</span>
          ) : undefined
        }
      >
        <div className="flex flex-col items-center gap-3">
          <Qr text={url} size={r.must ? 168 : 136} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(r.who);
            }}
            className="t-small-strong h-9 rounded-full border border-line px-4 hover:bg-sunken"
          >
            {copied === r.who ? "Link copied" : "Copy link"}
          </button>
        </div>
      </Panel>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHead
        title="Jury demo"
        sub="Two phones and this laptop share one live mill. Scan a code with each phone."
      />

      <Panel
        title="Live room"
        sub={
          room
            ? "Everything done on a device in this room shows on the others within a second."
            : "Start a room, then scan the codes with the phones."
        }
        aside={
          room ? (
            <span
              className={cx(
                "t-small-strong flex items-center gap-2 rounded-full px-3 py-1",
                live.state === "live"
                  ? "bg-ok-soft text-ok"
                  : live.state === "offline"
                    ? "bg-critical-soft text-critical"
                    : "bg-sunken text-muted",
              )}
            >
              <span
                className={cx(
                  "size-2 rounded-full",
                  live.state === "live"
                    ? "bg-ok"
                    : live.state === "offline"
                      ? "bg-critical"
                      : "bg-[var(--line-strong)]",
                )}
              />
              {live.state === "live"
                ? "Connected"
                : live.state === "offline"
                  ? "Offline, retrying"
                  : "Connecting"}
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
                {devices.length} device{devices.length === 1 ? "" : "s"}{" "}
                connected
                {devices.length
                  ? `: ${devices.map((d) => `${d.label} (${d.kind})`).join(" · ")}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirm ? (
                <>
                  <span className="t-small self-center text-muted">
                    Clear every ticket raised in this room, on every device?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirm(false)}
                    className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken"
                  >
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
                  <button
                    type="button"
                    onClick={() => setConfirm(true)}
                    className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken"
                  >
                    Reset demo
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRoom(null)}
                    className="t-small-strong h-10 rounded-full border border-line px-4 text-muted hover:bg-sunken"
                  >
                    Leave room
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                switchRoom(`jury-${Math.floor(1000 + Math.random() * 9000)}`)
              }
              className="t-small-strong h-11 rounded-full bg-brand px-6 text-on-brand hover:bg-[var(--brand-hover)]"
            >
              Start a jury room
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="t-small-strong h-11 rounded-full border border-line px-5 hover:bg-sunken"
            >
              Clear demo alerts on this laptop
            </button>
          </div>
        )}
      </Panel>

      {room && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {roles.filter((r) => r.must).map(card)}
          </div>
          <div>
            <p className="t-small-strong mb-1">
              Optional: more phones to show the escalation
            </p>
            <p className="t-small mb-3 text-muted">
              Without them, the dashboard still shows who QC Alert is waiting on
              at each step.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {roles.filter((r) => !r.must).map(card)}
            </div>
          </div>
          <Panel
            title="Mill clock"
            sub="Shared by every device. Skip ahead to show what happens when nobody answers, without waiting."
            aside={<span className="t-stat !text-[24px]">{hhmm(now)}</span>}
          >
            <div className="flex flex-wrap gap-2">
              {[5, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => skip(m)}
                  className="t-small-strong h-10 rounded-full border border-line px-4 hover:bg-sunken"
                >
                  Skip {m} min
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}

      <Panel title="How the run goes">
        <ol className="t-body flex list-decimal flex-col gap-2 pl-5">
          <li>
            Rohan (phone 1, lab) taps <b>Report a failed test</b>: frame 1 to
            12, <b>Count</b>, and a reading outside the limit shown (for example
            25), then reports it.
          </li>
          <li>
            The alert appears on the dashboard straight away, and QC Alert sends
            it to Krish, the supervisor of that frame.
          </li>
          <li>
            <b>If Krish answers:</b> he gets the full-screen alert with sound
            and taps <b>I’m fixing it</b>. The dashboard shows “Krish is
            fixing”.
          </li>
          <li>
            <b>If nobody answers:</b> press <b>Skip 5 min</b>, and Farhan
            (backup supervisor) is alerted. Skip again: at 10 min the QC
            manager, at 20 min the plant head, who is also called. The dashboard
            shows who it is waiting on at every step. Anyone alerted can tap{" "}
            <b>I’m fixing it</b>; that stops the climb.
          </li>
          <li>
            Whoever is fixing taps <b>Fixed</b> and answers the short report:
            part, problem, when the frame was last OK, yarn made since then. The
            lab then re-tests: Rohan opens <b>Re-test after the fix</b> and
            enters a good reading. The alert closes on the dashboard.
          </li>
          <li>
            Press <b>Reset demo</b> before the next jury group.
          </li>
        </ol>
        <p className="t-small mt-4 text-muted">
          On each phone: open the link, tap the screen once so the alert sound
          is allowed, keep the screen on. iPhone: turn the silent switch off.
          Phones need internet (Wi-Fi or mobile data).
        </p>
      </Panel>
    </div>
  );
}
