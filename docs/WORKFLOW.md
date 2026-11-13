# QC Alert: workflow

**Version 2, 13 Nov 2026 · Tanish. This is the current direction.** Where `HANDOFF.md` or anything below the line disagrees, this top part wins.

## In one line

The **phone app is where things happen**; the **dashboard is the record and the go-between**. Nobody decides anything on the dashboard.

## The phone: alert → fixing → fixed → report

1. **The lab tester reports a failed test** on the phone: frame, test, reading. (Passing tests stay in the register.)
2. **QC Alert sends the alert** to the supervisor of that frame. Full screen, with sound for critical.
3. **Someone taps "I'm fixing it".** That person owns the alert, the escalation stops, and the fixing time starts.
4. **They tap "Fixed"** and the app asks **what happened**: which part of the machine needed fixing (drafting zone, top rollers and aprons, spindles and travellers, creel and roving, something else, not a machine part), the cause (machine, setting, material, other, no cause found), and an optional note and photo.
5. **The lab re-tests** the frame. A pass closes the alert; a fail reopens it and alerts the supervisor again.
6. The report and every message go into the dashboard's record.

Optional on the way: send a fitter, mark "waiting for a spare part" (pauses the timer), hand over to the next shift.

**No held yarn in the app.** The mill handles the yarn as it does today.

## The dashboard: the record and the go-between

- **Live alerts:** what failed, who QC Alert is waiting on, how long it has been open, which step it is at, the last message sent.
- **History:** every past alert with its fix report (part, cause, fixing time) and full message log. Search by frame.
- **Messages:** every message QC Alert sent (to whom, how) and every answer from the floor, by day; who it is waiting on right now.
- **Rules:**
  - *Who gets told, and when:* the frame's supervisor at once, the backup supervisor after 5 min, the QC manager after 10, the plant head (alert and a call) after 20. The QC manager can change the times.
  - *Rules document:* drag and drop the mill's rules PDF. It is read in the browser; the rules it understood (who gets told after how long, test limits) are listed for the QC manager to tick and apply. Rules QC Alert already follows are marked, anything else is kept as a note with the document.
  - *The rules in plain words:* one sentence per rule, copyable, for people and for an AI to read and analyse.
  - *Test limits* per yarn and test.
- **Monthly report:** faults, time to "I'm fixing", fixing time, causes, parts fixed most, frames that repeat.

## Jury demo (about 3 minutes)

1. Open `#demo`. Live alerts says "No live alerts". Phone shows Rohan (lab).
2. Dashboard → Rules → drop `rules-sample.pdf` (link on the page) → Apply. The chain becomes 4 / 8 / 15 min.
3. Rohan: **Report a failed test** → frame 12 → count → **28.9** → Report.
4. Switch the phone to Krish: full-screen alert. Dashboard: live alert card, "Waiting on Krish".
5. Simulator → Skip 5 min: the backup supervisor is messaged (Messages shows it).
6. Krish: **I'm fixing it** → **Fixed** → Drafting zone, Setting → **Send fix report**.
7. Rohan: re-test of Frame 12 → **30.0** → closed.
8. Dashboard → History → the alert: fix report and the full message log.

---

Earlier version (kept for context; held yarn and the supervisor checklist below are no longer in the app):

## The idea

QC Alert replaces the phone call, not the register. When a lab test fails, the right person is told in seconds, has to own it, and the fault is not closed until it is fixed, re-tested and the held yarn is decided.

## Rules we design by

- **Exceptions only.** Nobody opens the app while tests pass. It comes alive only when a test fails.
- **Registers stay.** The mill keeps its paper registers and printouts. The app records the incident, not the production.
- **No machine integration.** No sensors, servers or APIs on the machines. The lab tester's entry is the only input.
- **Every fault has an owner and a timer.** If nobody responds, it moves up automatically.
- **Nothing closes on a promise.** "Fixed" is confirmed by a re-test.

## Nine steps

Example: count test on Ring Frame 12, Lot 2417, 30s yarn.

1. **Sample fails in the lab.** The lab tester runs the usual test and writes it in the register as today.
2. **Lab tester marks it failed in the app.** Frame, lot (on the sample label), which test, the reading, and when the frame last passed. Example: RF-12 · Lot 2417 · count · 28.9 · last passed 06:00.
3. **The system sorts it.** Compares the reading to the limit the QC manager set (30s: 29.4 to 30.6), sets the severity, opens a ticket and holds the yarn RF-12 made since it last passed.
4. **The supervisor of that frame gets the alert.** Full-screen alert with sound: what failed, by how much, which frame, which lot.
5. **Supervisor taps Seen and owns it.** The timer stops. He ticks the other frames running Lot 2417 (he knows them from the floor and the register), tags the held cops and taps Held.
6. **He stops or corrects the line.** Sends the fitter if it is a machine problem; the fitter marks repair done.
7. **Supervisor marks it fixed and picks the cause.** Machine, setting, material, other, or no cause found (opens a root-cause check). Optional note or photo.
8. **The lab re-tests.** RF-12 and the ticked frames go to the top of the lab's list. A pass confirms the fix; a fail reopens the ticket and alerts the supervisor again.
9. **QC manager decides on the held yarn and the ticket closes.** Release, re-test more, reprocess or downgrade. The supervisor is told so the yarn moves or stays.

## Escalation

| Time since alert, no Seen | Alert goes to | Why them |
| --- | --- | --- |
| 0 min | Shift supervisor of that frame | Decides to stop or fix the line |
| 5 min | Backup supervisor on the same shift | Covers breaks, other frames, phone away |
| 10 min | QC manager | Owns quality and the held yarn |
| 20 min | Plant head | Final owner |

Whoever taps Seen first owns the ticket. Waiting for a spare part pauses the timer with a reason. A frame makes about 0.5 kg of 30s yarn a minute, so 30 minutes across 3–4 sister frames is about 45–60 kg more bad yarn.

## Held yarn

1. **Created with the alert**, covering what the frame made since it last passed. The app estimates the kg from the time window.
2. **Made real by the supervisor:** red hold tag on the cops, kept off the trolley to winding, tap Held. Until then the hold exists only on screen.
3. **Decided by the QC manager** after the re-test: release, re-test more, reprocess, downgrade. Release against a failed test only with a reason and the plant head's sign-off.
4. **Closed.** The supervisor is told, removes or keeps the tag, and taps when the yarn is moved.

| When | Who is told |
| --- | --- |
| Hold created | QC manager + supervisor |
| Re-test result in | QC manager |
| Undecided after 2 hours | QC manager (reminder) |
| Undecided by end of shift | Plant head |
| Decision made | Supervisor |

## Effort per fault

| Person | In the app | Effort |
| --- | --- | --- |
| Lab tester | Mark failed; later enter the re-test | 2 entries |
| Supervisor | Seen · tick sister frames · Held · stop/correct · fixed + cause | ~5 taps |
| Fitter | Repair done | 1 tap |
| QC manager | Decide on the held yarn | 1 decision |
| Plant head | Only if escalated or a release needs sign-off | 0–1 |

## Dashboard: alerts, not machines

- **Live alerts:** what failed, how serious, who owns it, how long it has been open, which step it is at.
- **Waiting for a decision:** held yarn and how long it has waited.
- **History:** every past fault with frame, test, cause, time to Seen, time to fixed, kg held and decision. Search by frame.
- **Overall:** this month's faults, response times, top causes, frames that repeat, kg held vs released.

There is no grid of machine cards: machines are not connected, so a frame appears only as a field on a ticket.

## What we dropped, and why

- Early detection with winding sensors: needs machine integration; not needed to prove the idea.
- Agents on lab PCs, servers, APIs: heavy; the lab tester's entry does the same job.
- Machine status cards, the floor map and the Machines page: machines are not connected.
- AI insights page: not needed for the core story; top causes and repeat frames cover it.

**Scope, honestly:** QC Alert shortens the time *after* a failed test and stops a fault spreading. It does not shorten the 8 hours between tests. The operator can still raise a ticket if he notices something before the next test.

## To confirm with the plant head

- [ ] Is the first alert right for the frame's shift supervisor, with 5 / 10 / 20 minute escalation?
- [ ] Who should hear about a hold: just the QC manager and supervisor, or the planner too?
- [ ] How long can held cops wait before they block winding: is 2 hours right for a reminder?
- [ ] Can the lab tester enter a fail in under a minute during a busy shift?

## Jury demo (about 3 minutes)

1. Open `#demo`. Overview says "No live alerts". Phone shows Rohan (lab).
2. Rohan: **Report a failed test** → frame 12 → count → **28.9** → last passed 06:00 → Report.
3. Switch the phone to Krish: full-screen alert. Dashboard: live alert card, about 110 kg held, "not tagged yet".
4. Nobody taps: Simulator → Skip 10 min. The card says "Waiting on the QC manager"; Priya gets the alert.
5. Krish: **Seen** → tick frames 13 and 14 → **Held** → **Stopped it** → **Mark fixed**, cause Setting.
6. Rohan: the re-test of Frame 12 is at the top of the list → **30.0** → fix confirmed.
7. Dashboard → Held yarn → Release with a reason. Krish's phone: "Release: remove the red tag" → **Done, yarn moved**. Ticket closed.
