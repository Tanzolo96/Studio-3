# QC Alert: brief for building the presentation

**For an AI agent (or a teammate) making the jury deck.** Read this file first; it is the current state as of 14 Nov 2026. It sums up what QC Alert is, every decision we took and why, what changed, each screen, the live demo, and the numbers to quote. Where this file and older docs disagree, this file and the top of `docs/WORKFLOW.md` win.

- Project: Interaction Design, UID Gandhinagar, **Team 11** (Tanish, Mannur Thishya, Yagna Khandelwal).
- Live site: https://tanzolo96.github.io/Studio-3/ (start screen) · dashboard `#dashboard` · phone app `#app` · live jury demo `#jury` · one-screen demo `#demo`.
- Code: `Tanzolo96/Studio-3` on GitHub, branch `main`.

---

## 1. The product in one breath

**QC Alert tells the right person, in seconds, when a yarn test fails at a spinning mill, makes someone own the fix, and keeps a record of what happened.** The **phone app is where things happen**; the **dashboard is the record and the go-between**. Nobody decides anything on the dashboard.

### The problem (for the "why" slides)
- In a ring-spinning mill the lab tests yarn (count, strength/CSP, twist, evenness/CV). When a test fails today, the lab tells the floor by **phone call or by walking over**. Calls get missed, nobody clearly owns the fault, and the frame keeps making bad yarn meanwhile.
- Every minute a faulty frame runs, it makes off-spec yarn: in our demo mill, about **250 kg of bad yarn per critical incident before QC Alert**.
- Nobody can later say who was told, when, who answered, what was wrong and how long it took.

### The idea
- **Exceptions only.** The app is silent while tests pass; it comes alive only when one fails.
- **Every fault has an owner and a timer.** If nobody answers, it moves up the chain automatically.
- **Nothing closes on a promise.** "Fixed" is confirmed by a lab re-test.
- **Registers stay.** The mill keeps its paper registers; no sensors or machine integration. The lab tester's entry is the only input.

---

## 2. Roles (people in the demo mill)

| Role | Person in the demo | What they do in QC Alert |
|---|---|---|
| Lab tester | **Rohan Desai** (A shift) | Reports a failed test on the phone: frame, test, reading. Does the re-test after a fix. |
| Shift supervisor | **Krish Patel** (A shift, frames 1–12) | Alerted first for his frames. Taps "I'm fixing it", fixes, sends the fix report. |
| Backup supervisor | **Farhan Qureshi** (A shift, frames 13–24) | Alerted if the frame's supervisor has not answered in 5 min. |
| QC manager | **Priya Shah** | Runs the dashboard (record, rules, monthly report). Alerted at 10 min. |
| Plant head | **Mohit Maheshwari** | Information only: top alerts, what happened, monthly report. Alerted and called at 20 min. |
| Fitter / machine operator | Suresh Kumar, Ramesh Yadav, … | Still in the app (send a fitter, operator can raise on own frames) but **not** part of the jury story. |

The mill: 24 ring frames, 3 shifts (A 06–14, B 14–22, C 22–06), 4 yarns (30s combed for Buyer B, 40s combed for Buyer A, 20s carded for Buyer C, 60s compact for Buyer A).

---

## 3. The flow (the core slide)

1. **Lab tester reports a failed test** on the phone (frame, test, reading).
2. **QC Alert alerts the frame's supervisor**: full-screen alert with sound on critical.
3. **Escalation if nobody answers** (times editable by the QC manager):
   - **0 min** frame's supervisor → **5 min** backup supervisor → **10 min** QC manager → **20 min** plant head (alert + phone call).
4. **Someone taps "I'm fixing it"**: they own it, the climb stops, a fixing timer starts.
5. **"Fixed" opens a short report**: which part of the machine, what the problem was, **when the frame was last OK**, and **how much yarn it made on that lot since then** (prefilled estimate, editable), optional note and photo. The report records **how long the fix took**.
6. **Lab re-tests**: pass closes the alert; fail reopens it and alerts again.
7. **Every step and message lands in the dashboard record.**

(A ticket raised by hand for something seen on the floor, not a lab test, closes when the fix report is sent; there is nothing to re-test.)

---

## 4. Decisions we took, and why (one slide or a "design decisions" section)

| Decision | Why |
|---|---|
| **No held yarn in the app** (removed hold / release / reprocess / downgrade). | The mill already handles yarn its own way; deciding yarn fate in an app added steps nobody asked for. We focus on the alert reaching the right person fast. |
| **Phone = action, dashboard = record and go-between; no decisions on the dashboard.** | People on the floor act on phones. The dashboard shows what happened, who was told, who answered. Even the plant head's screen only informs. |
| **The lab tester raises the alert, not the machine operator.** | The lab is where a failed test is actually seen. Operators can still raise a floor problem on their own frames, but the jury story starts in the lab. |
| **Escalation chain 0 / 5 / 10 / 20 min** (supervisor → backup → QC manager → plant head). | Matches how a mill escalates by phone today, but automatic and timed. QC manager can change the times on the Rules page. |
| **"I'm fixing it" is the one tap that stops escalation and starts the timer.** | One clear moment of ownership; we measure time-to-start and time-to-fix from it. |
| **Fix report asks: part, problem, last good time, yarn made since.** | Turns each fix into data: which parts fail most, what causes faults, how much yarn a fault touched. |
| **Rules as sets per yarn and buyer**, added from a CSV (Excel) or PDF, removable as a whole or one limit at a time. | Every buyer has different limits; mills already keep these in Excel/PDF. Adding/removing a whole set at once is how they think about it. |
| **Plant head sees information, not decisions**: top alerts of the last week and the story of each, in plain sentences. | He needs to understand what is going wrong, quickly, not approve things. Plain text is his mental model. |
| **Multi-frame raise**: one tap, several frames, one alert per frame to each frame's supervisor, each noting the others. | A fault often shows on several frames of the same lot; each frame's own supervisor must be told. |
| **Live demo across real phones with no server of our own.** | Jury sees the real thing on two phones and a laptop. We use Supabase Realtime broadcast only (no tables, no backend code). |
| **A month of realistic past alerts in the demo** (but nothing open at start). | Reports, calendar and charts have something meaningful to show; the live demo alert stands out. |

---

## 5. What changed recently (timeline of the last iterations)

1. **Workflow v2**: removed held yarn; Alert → Fixing → Fixed + report → Re-test; dashboard became the record (Live alerts, History, Messages, Rules, Monthly report).
2. **Fix questionnaire**: fixing timer on the phone; report asks part, problem, last good time, yarn made since (kg).
3. **Rules**: rule sets per yarn/buyer from CSV or PDF; remove a set or one limit; newly added sets marked "just added"; history keeps the limit that applied when each alert fired.
4. **Dashboard**: first page is **Overview** for every role; History is a plain list (board removed); Account shows person details (email, phone, gender, employee ID, department, reports to, joined, languages) and a simple people table.
5. **Monthly report** (QC manager and plant head see the same): calendar with days coloured by number of alerts (1 green, 2 yellow, 3+ red), the picked day's alerts beside it, "How fast alerts were fixed" (per-alert start time vs 5-min target, fixing time), top causes. "By shift" median widget removed.
6. **Plant head Overview**: decisions removed; "Top alerts last week" (headings only) on the left, "What happened" on the right as plain sentences; calendar below.
7. **Live jury demo**: phones and laptop in one live room; its own page with QR codes, connected devices, shared mill clock with Skip 5/10 min, Reset demo.
8. **Phone app polish**: no zoom-jumps on iPhone (text boxes ≥16px), no page bounce, keyboard no longer squeezes the layout, fewer animations, clean window on a laptop.

---

## 6. Screens (one slide each, or a grid)

Take screenshots from the live site (`#dashboard`, `#app`, `#jury`). Day or Night theme both work.

**Phone app**
- **Lab home (Rohan)**: big red "Report a failed test" button; urgent re-tests listed.
- **Report a failed test**: frame grid, test, big reading box with the limit shown.
- **Full-screen alert (Krish)**: frame, test, reading vs limit, "I'm fixing it".
- **Fixing**: big timer, "Fixed" button, optional "send fitter" / "waiting for spare part".
- **Fix report**: fixing time, 4 numbered questions (part, problem, last OK, yarn since).
- **Raise ticket**: tap one or more frames, the problem, severity.
- **History**: past alerts with cause filters.

**Dashboard (laptop)**
- **Overview (QC manager)**: live alerts with step bars (Alert · Fixing · Fixed · Re-test) and who it is waiting on; latest messages; this month.
- **Overview (plant head)**: Top alerts last week + What happened (plain sentences) + calendar.
- **History**: one list of every alert; click for the full alert page (fix report + message log + timeline).
- **Messages**: everything QC Alert sent and every answer, by day.
- **Rules**: alert chain times, add rules from a file (rule-set cards), rules in plain words (copyable for AI), test limits per rule set with Remove set / Remove one limit.
- **Monthly report**: headline numbers, alert calendar, how fast alerts were fixed, top causes, Download PDF.
- **Account**: profile with full details, people table, notifications, demo data (clear), switch view.

**Jury demo page** (`#jury`): room code, connected devices, QR code per role, mill clock with Skip, Reset demo, the run in steps.

---

## 7. The live jury demo (what to put on the "demo" slide and say aloud)

Devices: **laptop** (dashboard as Priya), **Phone 1 Rohan** (lab), **Phone 2 Krish** (supervisor). Optional: Phone 3 Farhan (backup), Phone 4 Mohit (plant head).

1. Laptop: open `#jury` → **Start a jury room** → each phone scans its QR code → "3 devices connected" → **Open dashboard**.
2. Rohan: **Report a failed test** → frame 1–12 → Count → a reading outside the limit (e.g. 25) → report.
3. The alert appears on the dashboard at once; Krish's phone rings full-screen.
4. To show escalation: don't answer; on the jury page press **Skip 5 min** → Farhan is alerted; again → dashboard shows "Waiting on QC manager"; at 20 min the plant head.
5. Krish (or whoever was alerted) taps **I'm fixing it** → dashboard "Krish is fixing" → **Fixed** → short report.
6. Rohan: **Re-test after the fix** → good reading → alert closes on the dashboard.
7. Dashboard → History → open the alert: fix report, every message, the timeline. Plant head view: "What happened" tells the story in plain sentences.
8. **Reset demo** before the next group.

Tested live: each step reached the other devices in under a second.

---

## 8. Numbers to quote (demo data, last 30 days to 5 Nov)

Say clearly that these come from the simulated month in the prototype, not a real mill.

- **20 critical or major alerts** (15 critical) in 30 days; 30 alerts in all.
- **Median time to "I'm fixing it": 3 minutes** (target 5).
- **Median fixing time: 49 minutes.**
- **Yarn made before the fix: about 142 kg per critical alert, against about 250 kg before QC Alert** (our baseline for phone-call days).
- **Top cause: setting (7)**, then machine (5); **part fixed most: drafting zone (7)**.
- **Frame with most alerts: RF-12 (4 in the month)**, a repeat-fault frame worth showing.

---

## 9. How it is built (one technical slide, keep it light)

- **Web app** (React + TypeScript + Tailwind), works on any phone browser, can be added to the home screen. **No app store, no Expo**; one code base for phone and dashboard.
- **Every change is an event** in a log (report, alert, I'm fixing, fixed, re-test…). Every screen is rebuilt from that log, so the record is complete by design and escalation is worked out from time.
- **Live sync for the demo**: Supabase Realtime broadcast carries events between devices in a private room; each device keeps its own copy, a late joiner is brought up to date by the others. No database tables, no backend code.
- Rules PDFs are read **in the browser** (no upload). CSV rule sets from Excel.
- Alert sound and vibration through the browser; the phone screen stays awake during the demo.
- Hosted free on GitHub Pages; 32 automated tests on the logic.

---

## 10. Suggested slide outline (about 12–14 slides)

1. **Title**: QC Alert · catch a yarn fault sooner, make sure the right person fixes it. Team 11, UID Gandhinagar.
2. **The problem**: failed test → phone call → missed, unowned, bad yarn keeps coming (≈250 kg per incident).
3. **Who is involved**: lab tester, supervisor, backup, QC manager, plant head (roles table).
4. **Our idea**: exceptions only · an owner and a timer · nothing closes on a promise · registers stay.
5. **The flow**: report → alert → escalation 0/5/10/20 → I'm fixing it → fixed + report → re-test → record (diagram).
6. **Phone app**: 3–4 phone screenshots (lab report, full-screen alert, fixing timer, fix report).
7. **Dashboard: the record**: Overview + History/alert page + Messages.
8. **Rules the mill already has**: rule sets from Excel/PDF, alert chain times, plain-words rules.
9. **What the plant head sees**: top alerts + what happened in plain sentences.
10. **Monthly report**: calendar coloured by alerts, how fast alerts were fixed, top causes.
11. **Design decisions**: the decisions table (pick 5–6 rows).
12. **Results in the prototype**: the numbers in section 8.
13. **Live demo**: two phones + laptop (the run in section 7).
14. **How it is built** + **what's next** (section 11).

Design notes for the deck: use the app's own look (white or near-black background, light background `#f5f6f8` or night `#121417`, orange brand accent `#ff5a1f`, red `#c9261b` only for critical, Inter font), real screenshots rather than mock-ups, one idea per slide, short sentences.

---

## 11. Not done / next steps (for the closing slide)

- Real logins and accounts (today people are picked from a list).
- Real SMS / phone call to the plant head (the demo shows it in the app).
- Reading tests straight from lab instruments instead of typing them.
- Trying it in a real mill shift, measuring time-to-fix and yarn saved for real.
- The plant head's phone still has older decision screens from an earlier version; to be simplified like his dashboard.
