# QC Alert

> **New here? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first.** It has every decision, how the system works, the jury demo script and the milestone checklist with owners. Pick a milestone there before you start coding.

A quality alert system for yarn spinning mills. Interaction Design, UID Gandhinagar, Team 11 (Entrepreneurs Products).

**HMW** help a spinning mill catch a yarn fault sooner, and make sure the right person fixes it before more bad yarn is made?

| Gap | Today | QC Alert |
| --- | --- | --- |
| Found late | Lab tests every ~8 h | Winding-sensor drift triggers an urgent lab test |
| Told late | Phone, paper, in person | Full-screen alert on a dedicated app |
| Nobody owns it | Not tracked | Ticket with owner, timer, escalation, sister-frame check and yarn hold |

## Live prototype

https://claude.ai/artifact/FBhCsz6xKZ9Fjhb5VoenBG (claude.ai artifact; share it from the page's Share menu). Rebuild it with `npm run build:standalone`, which writes one self-contained `dist-standalone/qc-alert.html`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (rules, containment, escalation, holds)
```

| Route | What |
| --- | --- |
| `/demo` | Jury view: dashboard and a phone side by side, switch the phone between Krish, Rohan, Suresh, Priya, Mohit |
| `/dashboard` | Control side: Overview, Tickets, Held yarn, Machines (Insights, Report, Rules, Account next) |
| `/app` | Alert app: Alerts, Raise ticket, Previous, plus the full-screen takeover |
| `/kit` | Every component in Day and Night, to check against Figma |

Open several tabs (or `/demo`): they share one live event log in the browser. The **Simulator** (dashboard sidebar) stands in for the lab and the winding sensors, and controls the mill clock (pause, 1×, 10×, 60×, skip).

## Jury script (about 3 minutes)

1. `/demo`, dashboard is calm and gray. 05 Nov, 09:40, B shift.
2. Simulator → **Winding sensor drift** on RF-12. Phone (Rohan) gets an urgent count test.
3. Rohan enters **28.9** (limit 29.4–30.6) → critical. Switch to Krish: full-screen takeover. Dashboard: RF-12 red, RF-13/14 flagged, yarn since 08:01 on hold.
4. Nobody taps: Simulator → Skip 10 min. Escalated to Priya (switch phone to Priya). Skip 10 more for Mohit.
5. Krish: Seen → Start work → Send to a fitter (Suresh marks repair done) → Mark fixed, cause "Draft setting slipped".
6. Dashboard as Priya → Held yarn → Ask for re-test → Rohan enters 30.0 → Release. Ticket closes.
7. AI insight on Overview: "RF-12 failed count 5 times in October".

## How it works

- `src/engine`: pure TypeScript. Every change is an event (`result/enter`, `ticket/seen`, `hold/decide` ...) applied by `reducer.ts`. Escalation is a pure function of time (`selectors.ts`), so every device agrees without a server timer.
- `src/engine/seed.ts`: 24 frames, 4 products, 6 lots, 16 rules, ~5,000 test results and 31 tickets for Oct–Nov 2026, replayed through the same reducer.
- `src/store`: Zustand store + sync driver. Local driver = localStorage + BroadcastChannel (tabs and iframes). A Supabase driver with the same interface is the next milestone, for phones on other devices.
- `src/ui`: tokens (`styles/tokens.css`) and components named as in Figma file `qDZNbHwEKUBhFapp3osR8I`.

Real: rules, tickets, timers, escalation, containment, holds and decisions, roles, both themes, live sync between tabs.
Simulated: lab instruments and winding sensors (Simulator), push (in-app takeover with sound), AI insights (rules over the data, labelled AI).

## Screenshots

`node tests/shots.mjs shots` (with `npx vite preview --port 4173` running) walks the jury script and saves every step at 1440 px and 390 px in both themes.
