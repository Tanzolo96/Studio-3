# QC Alert: team handoff

Everything we decided, what is built, how it works, and what to build next.
Read this first, then `README.md` for run commands.

Interaction Design, UID Gandhinagar · Team 11 · Entrepreneurs Products module.
The prototype is judged on UX quality, clarity and craft, not backend scale.

---

## 1. Links

| What | Where |
| --- | --- |
| Code | https://github.com/Tanzolo96/Studio-3 |
| Branches | `main` is the shared, up-to-date branch. Work on your own branch and open a pull request into `main` |
| Live prototype | https://claude.ai/artifact/FBhCsz6xKZ9Fjhb5VoenBG (private until shared from its Share menu) |
| Figma (source of truth for the design system) | https://www.figma.com/design/qDZNbHwEKUBhFapp3osR8I |
| IA map (FigJam) | https://www.figma.com/board/mYtDukXXBa4H6pnzcpQq6Y |

Start views on the live page: add `#demo`, `#dashboard` or `#app` to the link.

---

## 2. The problem

In a yarn spinning mill, the quality lab tests yarn about **every 8 hours**. When a ring frame starts making faulty yarn (for example too thick), it keeps running until the next test. When that test fails, the result reaches the floor supervisor by **phone, paper or in person**, while the machine keeps running. Sister frames making the same yarn are not checked straight away. By the time the frame is fixed, **200–300 kg of bad yarn per machine** has been made, up to **~1 tonne per incident** across 3–4 machines. About **3% of yarn** is affected. Figures validated by the plant head, Mohit Maheshwari.

Not the problem: traceability. Results are already linked to lot, machine, shift and cotton, and repeat faults already go through RCA.

**HMW:** How might we help a spinning mill catch a yarn fault sooner, and make sure the right person fixes it before more bad yarn is made?

| Gap | Today | QC Alert |
| --- | --- | --- |
| Found late | Lab tests every ~8 h | Winding-sensor drift triggers an urgent lab test |
| Told late | Phone, paper, in person | Full-screen alert on a dedicated app |
| Nobody owns it | Not tracked | Ticket with owner, timer, escalation, sister-frame check and yarn hold |

---

## 3. One system, two products

- **The system**: rules, tickets, timers, escalation, containment, holds. Lives in `src/engine`.
- **Alert app** (`/app`, mobile, floor side): supervisor, lab tester, fitter. Three tabs: **Alerts · Raise ticket · History**, plus the full-screen alert takeover. Faculty preferred a dedicated app over WhatsApp.
- **Dashboard** (`/dashboard`, web, control side): QC manager, plant head, supervisor (view). Nav order: Overview · Tickets · Held yarn · Machines · AI insights · Monthly report · Rules · Account.

Machines and lab instruments are **simulated**. Everything else runs for real in the browser.

---

## 4. Decisions so far

| Topic | Decision | Why |
| --- | --- | --- |
| Repo | Separate repo `Tanzolo96/Studio-3`, not inside the portfolio site | Portfolio is a static site; the app needs a build |
| Stack | Vite + React 18 + TypeScript + Tailwind v4, Zustand, React Router, Carbon icons, IBM Plex | Everything runs in the browser; Next.js server rendering adds nothing |
| App form | Installable web app (PWA manifest), phone frame on desktop, full screen on a phone | One codebase; Expo would mean two |
| Push | In-app takeover with sound (WebAudio) and vibration; real web push is a bonus | Reliable in a demo; browsers need one tap to allow sound, so the app opens with "Turn on alerts" |
| Who runs the timers | Nobody: escalation is computed from time (`selectors.ts › escalation`) | Every device agrees without a server timer |
| Data sync | Event log. Local driver now (localStorage + BroadcastChannel: tabs, iframes, the `/demo` view). Supabase driver planned (M5) | Phones on other devices need a shared backend |
| Hosting | claude.ai artifact (single HTML file) for now. Vercel planned with Supabase | Zero setup; a link that works today |
| Raise ticket | Goes straight to the supervisor queue. Raised by a supervisor = starts as Seen | No QC review step |
| Held yarn | Only the QC manager decides; the plant head approves a release against a failed or missing re-test | From the brief |
| After Seen | No escalation after Seen in v1; elapsed time is shown | Brief only times Seen |
| AI insights | Rules over the real data, worded from templates, labelled AI with confidence and evidence. No live LLM | Stable in front of a jury |
| Language | English v1, all words in code so Hindi/Gujarati can be added later | |
| Login | No real login. A person switcher (Krish, Rohan, Suresh, Priya, Mohit); permissions still apply | |
| Monthly report export | Planned via browser Save as PDF in the Vercel build. The claude.ai page cannot print, so it needs another route there | |

**Changes after user review (keep these):**
- Dashboard felt like a control panel. Overview is now visual: greeting and a one-line floor status, live alerts as story cards with a progress bar, KPI cards with sparklines, a drawn floor map, and charts. Panels use 8 px radius and more air.
- App: home shows **only active issues** ("Active issues", with an "All clear" state). The ticket screen answers **"Resolved / Not resolved yet" first**, then a 4-step progress bar, then the details; the text log is folded into "Full history". "Previous" is renamed **History** (resolved issues grouped by day).

---

## 5. Users and permissions

| Role | Person in the seed | Uses | Can do |
| --- | --- | --- | --- |
| Shift supervisor | Krish Patel (B), Vikram Singh (A), Anil Rathod (C) | App (main), dashboard (view) | Seen, Working on it, send to fitter, Mark fixed with cause, hand over, raise ticket |
| Lab tester | Rohan Desai (B), Meena Joshi (A), Deepak Rao (C) | App | Urgent test requests, enter results, mark sample error |
| Fitter | Suresh Kumar, Imran Shaikh (B), Ramesh Yadav (A), Harish Mehta (C) | App | Repair jobs, mark repair done |
| QC manager | Priya Shah | Dashboard + app for escalations | Only role that edits Rules and decides on held yarn. Escalation at 10 min |
| Plant head | Mohit Maheshwari | Dashboard | Sees everything, approves overrides, final escalation at 20 min |

Shifts: **A 00:00–08:00, B 08:00–16:00, C 16:00–24:00** (matches the Figma examples, "B shift · 10:20"). Alerts go to the role on shift, not to names.

---

## 6. How the system works

### Severity
| Level | Shape | Phone | Yarn | Escalation |
| --- | --- | --- | --- | --- |
| Critical | Triangle | Full-screen takeover + repeating sound | Held since the last good test | Seen in 5 min, else QC manager at 10, plant head at 20 |
| Major | Diamond | Takeover, one soft chime | Not held | Same timers |
| Minor | Circle | No phone alert, dashboard only | Not held | None |

### States
Ticket: `open → seen → working → fixed → closed`. "Escalated" is not a state; it is derived from time when a ticket is still `open`.
Hold: `on_hold → released | reprocess | downgrade`. A release without a passed re-test waits for plant head approval.

### What happens on each event (`src/engine/reducer.ts`)
- **Winding drift** (`sim/drift`) past the product's CV warning line → Major drift ticket + urgent count test for that frame. A second drift on the same frame is grouped ("New sensor reading added").
- **Lab result** (`result/enter`) is checked against `Rule(product, test, min, max, severity, seenMins, escalateQcMins, escalatePhMins)`.
  - Pass on a drift request → ticket closes "Checked, OK".
  - Fail with an open drift ticket on that frame → the same ticket is raised to the rule's severity and the alert restarts.
  - Fail with an open ticket for the same frame and test → grouped, no new alert (alarm budget, ISA-18.2).
  - Otherwise a new ticket.
  - **Critical → contain**: hold yarn since the last good test on that frame (kg = rate × hours, keeps growing until Fixed), flag sister frames (same lot), send urgent sister tests (due in 15 min).
- **Sample error** → if no real failing reading is left: hold released, sister tests cancelled, ticket closed as a false alarm (counted in reports).
- **Re-test of held yarn** → records passed/failed on the hold; never raises a new alert.
- **Fixed** → hold stops growing; ticket closes at once if nothing is held, else when the QC manager decides.

### Escalation is pure time (`src/engine/selectors.ts`)
`escalation(ticket, now)` → level 0 / 1 (QC) / 2 (plant head) from `alertAt` and `seenAt`. Takeovers (`takeoversFor`) and the timeline's escalation entries come from the same function, so every screen and device agrees.

### Data and seed (`src/engine/seed.ts`)
- 24 ring frames in 3 rows of 8, 4 products, 6 lots, 16 rules (count, CSP, twist, CV per product).
- Products: 30s combed Buyer B (29.4–30.6 Ne, 30 kg/h), 40s combed Buyer A (39.2–40.8), 20s carded Buyer C (19.6–20.4), 60s compact Buyer A (59–61).
- Lots: RF-12, 13, 14 run Lot 2417, so a fail on RF-12 flags 13 and 14 (as in the brief). RF-04 is stopped for doffing.
- About 5,000 routine results from 01 Oct to 05 Nov 2026, and 31 historic tickets **replayed through the real reducer**, including RF-12 failing count 5 times in October (4 of them within 2 h of a roving change) for the AI insight.
- Demo starts **Thu 05 Nov 2026, 09:40, B shift**, calm, with 2 old lots on hold (RF-17, RF-06).

### Time
All times are mill time (IST). The clock is an event (`clock/set`) with a speed: pause, 1×, 10×, 60×, and skip. Everyone computes `now` from it.

---

## 7. Code map

```
src/
  engine/      pure logic, no UI
    types.ts       data model and the event union
    reducer.ts     apply(state, event): every rule above
    selectors.ts   escalation, takeovers, frame state, stats
    analytics.ts   numbers for the dashboard charts (incl. yarn saved vs 250 kg baseline)
    insights.ts    "AI" insights (rules + templates)
    seed.ts        the mill and its history
    time.ts, vocab.ts   mill time helpers, floor words (Too thick, causes, problems)
  store/       Zustand store, clock tick, person and theme per surface; sync.ts = sync driver
  ui/          tokens-based components named as in Figma: primitives, cards, charts, timeline, sound
  app/         Alert app: shell + tab bar, takeover, screens (alerts, ticket, test entry, raise, history)
  dashboard/   shell + nav, Overview.tsx (visual), pages.tsx (tickets, ticket detail, held yarn, machines)
  demo/        Simulator panel, /demo split view, /kit component sheet
  routes.tsx   all routes; STANDALONE flag for the single-file build
  styles/      tokens.css (Day = light, Night = dark), base.css (Tailwind theme + type utilities)
tests/         engine.test.ts (Vitest), shots.mjs (Playwright walkthrough + screenshots)
scripts/       artifact.mjs (turns the single-file build into the hosted page)
```

### Rules for adding things
- **Every change is an event.** Add the event type to `MillEvent` in `types.ts`, handle it in `reducer.ts`, add a test in `tests/engine.test.ts`. Never mutate state from UI code; call `dispatch({...})`.
- **Derived things are selectors**, not stored fields (escalation, frame state, kg held).
- **Colours only from tokens** (`tokens.css`); never hex in components. Both themes must work.
- **Severity is never colour alone**: shape + word + colour.
- **Floor words, not codes** ("Too thick", not `CNT_LOW`). Buttons are verb + object ("Mark fixed", "Save rule"). No em dashes in UI copy. No lorem ipsum.
- **Numbers are evidence**: IBM Plex Mono, tabular figures, next to their limit.
- **AI suggests, people decide**: teal `ai` tokens, confidence + evidence, the action opens the real screen.
- **Brand blue is for actions**, never for faults.

---

## 8. Design system notes

Colour palette (since Nov 2026): IT HEAVY moodboard, orange `#FF5A1F` accent on cool near-white/near-black greys. Earlier direction: ISA-101 "gray is good" on an IBM Carbon base, Carbon status pattern (never colour alone), Siemens iX for industrial UI.

Tokens live in `src/styles/tokens.css` and match the Figma variables 1:1, plus these additions:

| Addition | Value (Day / Night) | Why |
| --- | --- | --- |
| `--data` | `#5b6573` / `#9aa6b8` | Chart ink for normal data, a cool slate, not the orange brand (orange is actions) |
| `--chart-critical`, `--chart-major`, `--chart-minor` | red / amber / gray | In charts, Major is **amber**, not the UI orange: red vs orange failed the colour-blind check; red vs amber passes |
| `--grid` | `#e8e8e8` / `#333` | Hairline chart grid |
| Panel radius 8 px on the dashboard | | Friendlier, per user feedback (Figma cards use 4 px) |

Known deviations from the brief, decided on purpose:
- Figma's **Seen** chip is brand blue, which conflicts with "blue only for actions". We matched Figma. Change to gray if the team prefers.
- Overview no longer shows 24 FrameTile cards; it shows a drawn floor map. FrameTile is still used on the Machines page.

Components not yet in Figma (built in code first): Simulator, Timeline, hold decision card, incident card, floor map, charts (sparkline, stacked columns, bar list, category bar, trend with limit, shift bars, ring). **Add them to the Figma Components page** so Figma stays the source of truth.

---

## 9. Run, test, ship

```bash
npm install
npm run dev                # http://localhost:5173  (/, /demo, /dashboard, /app, /kit)
npm test                   # engine tests
npm run build              # normal build (for Vercel)
npm run build:standalone   # one HTML file: dist-standalone/qc-alert.html (the hosted page)
```

Screenshots of the whole jury script, 1440 px and 390 px, both themes:

```bash
npm run build && npx vite preview --port 4173
```

```bash
node tests/shots.mjs shots
```

Updating the hosted page: run `npm run build:standalone` and republish `dist-standalone/qc-alert.html` to the same artifact link (ask Claude in a session with access to the link, or replace the page through claude.ai).

---

## 10. Jury demo (about 3 minutes)

1. Open `#demo`. Dashboard is calm, "Floor is calm". Phone shows Rohan (lab).
2. Simulator (dashboard sidebar) → **Winding sensor drift** on RF-12. Rohan gets an urgent count test.
3. Rohan enters **28.9** (limit 29.4–30.6) → critical. Switch the phone to Krish: full-screen takeover. Dashboard: incident card, RF-12 red on the floor map, 13 and 14 flagged, yarn since 08:01 on hold and growing.
4. Nobody taps: Simulator → Skip 10 min. Escalated: switch to Priya, she gets the takeover. Skip 10 more for Mohit.
5. Krish: Seen → Start work → Send to a fitter. Switch to Suresh: Mark repair done. Krish: Mark fixed, cause "Draft setting slipped". The ticket shows **Resolved**.
6. Dashboard → Held yarn → Ask for re-test (RF-12 card). Rohan enters 30.0. Priya: Release with a reason. Ticket closes.
7. Overview: AI insight "RF-12 failed count 5 times in October", yarn saved estimate, charts.

Reset any time: Simulator → Reset demo.

---

## 11. Milestones

Legend: ✅ done · 🟡 partly done · ⬜ not started. Add an owner name when you pick one up.

| # | Milestone | Status | Owner |
| --- | --- | --- | --- |
| M0 | Scaffold, tokens from Figma, base components, Day/Night, `/kit` | ✅ | |
| M1 | Engine, seed, tests | ✅ | |
| M2 | Slice 1, the fault: simulator, lab request, takeover, critical response on the dashboard | ✅ | |
| M3 | Slice 2, the response: Seen → Working → fitter → Fixed, escalation, demo speed, tickets + detail | ✅ | |
| M4 | Slice 3, the yarn: Held yarn, re-test, release / reprocess / downgrade, plant head override | ✅ | |
| — | Hosting as a claude.ai page, `/demo` without iframes | ✅ | |
| — | Visual Overview, app "Resolved?" ticket, active-only home, History | ✅ | |
| M5 | Multi-device: Supabase + Vercel | ⬜ | |
| M6 | Remaining screens | 🟡 | |
| M7 | Polish, states, accessibility, full screenshot set | 🟡 | |
| M8 | Demo script mode + README + Figma update | 🟡 | |

### M5 Multi-device (Supabase + Vercel)
- [ ] Create a free Supabase project; table `events (id text pk, at bigint, by text, type text, payload jsonb, created_at timestamptz default now())`, Realtime on.
- [ ] `src/store/sync.ts`: add `supabaseDriver()` with the same `SyncDriver` interface (load all events ordered by `created_at`, append = insert, subscribe = Realtime inserts). Keep the local driver as offline fallback.
- [ ] Env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; pick the driver when they are set.
- [ ] Reset demo = delete all events then insert one `clock/set`.
- [ ] Connect the repo to Vercel (`vercel.json` already rewrites routes to `index.html`).
- [ ] QR code on `/demo` that opens `/app` on a jury member's phone.
- Done when: an alert fired from the laptop rings a phone on another network within 2 s, and escalation matches on both.

### M6 Remaining screens
- [ ] **Machines → frame detail** (`/dashboard/machines/:id`): count test history chart with the limit band, CV winding-sensor trend, fault history list, current lot and product. Use `TrendArea`-style charts from `ui/charts.tsx`.
- [ ] **AI insights** page: all insights from `engine/insights.ts` as `InsightCard`s, grouped by kind; each action opens the real screen. "Create RCA task" needs a real RCA task (new event `rca/create`, list on the frame page).
- [ ] **Monthly report**: summary (alerts, kg held, kg saved), response times by shift, top causes, worst frames, false alarms counted. Export as PDF (print stylesheet on Vercel; the claude.ai page cannot print).
- [ ] **Rules** (QC manager edits, others read-only), 6 steps: 1 product + test, 2 lower/upper limit, 3 severity, 4 who gets it + response times, 5 **preview impact on last month** ("would have raised 4 more alerts": re-run the rule over seeded results), 6 save, logged for everyone. New event `rule/save`. Plus sensor warning thresholds per product.
- [ ] **Account**: profile, people and roles, shifts and roster, notifications.
- [ ] **Shift change**: auto-move open tickets to the next shift supervisor at 08/16/24 if not handed over (derive from time like escalation).
- [ ] Bring **Tickets** and **Held yarn** pages to the same visual style as the new Overview (panels, kg bars, friendlier cards).
- [ ] App: friendlier Active issues cards (frame number large, plain issue line), matching the new ticket screen.

### M7 Polish
- [ ] Empty, loading, error and offline states on every list.
- [ ] WCAG AA contrast in both themes, visible focus, keyboard path through the dashboard, screen-reader labels on charts (most exist).
- [ ] One-handed check of the app at 375 px; tap targets ≥ 48 px.
- [ ] Full screenshot set at 1440 and 390 in Day and Night (`tests/shots.mjs`).
- [ ] Copy pass: verb + object buttons, floor words, no em dashes.

### M8 Demo and handoff
- [ ] Demo script mode: a "Next step" button on `/demo` that runs the jury script one step at a time.
- [ ] Add the new components to Figma (see section 8).
- [ ] Optional: Hindi labels on the app's main buttons.

---

## 12. Open questions for the team

1. **Jury date and screen**: projector at 1440 px or a laptop? Decides how early demo script mode is needed.
2. **Figma update**: who adds the code-first components to the Components page?
3. **Seen chip colour**: keep Figma's blue or switch to gray (principle 7)?
4. **Hindi/Gujarati**: needed for the jury, or v2?
5. **Supabase account**: whose? Share the URL and anon key (anon key is safe in the client; never commit the service key).

---

## 13. Known limits today

- Data lives in each browser. Phones on other devices do not see laptop events until M5.
- The claude.ai page: sound starts after the first tap; camera capture may fall back to a file picker; no printing.
- AI insights and the "yarn saved" number are estimates from seeded data and say so on screen.
- `Create RCA task` currently opens the Machines page; the RCA flow is in M6.
