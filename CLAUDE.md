# Instructions for AI coding sessions

Before doing anything in this repo, read `docs/WORKFLOW.md` (the current direction, 13 Nov 2026) and then `docs/HANDOFF.md` in full. Where they disagree, WORKFLOW.md wins. It is the shared source of truth for the product, decisions, architecture, design rules and milestones.

- Follow the rules in HANDOFF section 7 ("Rules for adding things") and section 8 (design system).
- Every state change is an event in `src/engine` with a test in `tests/engine.test.ts`.
- When you finish a milestone item, tick it in `docs/HANDOFF.md` section 11 in the same commit.
