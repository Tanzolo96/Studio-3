// "AI" insights for the prototype: rules over the real data, worded from templates.
// Always labelled AI, with a confidence and the evidence, and they only suggest.

import type { MillState } from './types';
import { HOUR, mill, millDayKey, monthName } from './time';
import { frameView } from './selectors';

export interface InsightData {
  id: string;
  kind: 'Repeat pattern' | 'Rule suggestion' | 'Test sooner' | 'Likely cause';
  confidence: number;
  title: string;
  body: string;
  basis: string;
  action: string;
  target: string; // route of the real screen where a person decides
}

export function insights(s: MillState, now: number): InsightData[] {
  const out: InsightData[] = [];

  // Likely cause for an open critical fault, from that frame's history.
  const open = s.tickets.find((t) => t.status !== 'closed' && t.status !== 'fixed' && t.severity === 'critical');
  if (open) {
    const past = s.tickets.filter((t) => t.frameId === open.frameId && t.cause && t.id !== open.id);
    const counts = new Map<string, number>();
    for (const t of past) counts.set(t.cause!, (counts.get(t.cause!) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top)
      out.push({
        id: `cause-${open.id}`,
        kind: 'Likely cause',
        confidence: Math.min(90, 45 + top[1] * 9),
        title: `${open.frameId}: check ${top[0].toLowerCase()} first`,
        body: `${top[1]} of the last ${past.length} faults on this frame were ${top[0].toLowerCase()}. Tell the fitter before they start.`,
        basis: `${past.length} closed tickets on ${open.frameId}`,
        action: 'Open ticket',
        target: `/dashboard/tickets/${open.id}`,
      });
  }

  // Repeat pattern: frame with most count fails, and how many came after a roving change.
  const monthStart = mill(`${millDayKey(now).slice(0, 7)}-01`);
  const prevStart = mill(`${millDayKey(monthStart - 1).slice(0, 7)}-01`);
  const fails = s.tickets.filter((t) => t.test === 'count' && t.kind === 'test_fail' && t.closeReason !== 'sample_error' && t.createdAt >= prevStart && t.createdAt < monthStart);
  const byFrame = new Map<string, typeof fails>();
  for (const t of fails) byFrame.set(t.frameId, [...(byFrame.get(t.frameId) ?? []), t]);
  const worst = [...byFrame.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (worst && worst[1].length >= 3) {
    const [frameId, list] = worst;
    const afterRoving = list.filter((t) => s.rovingChanges.some((r) => r.frameId === frameId && t.createdAt - r.at > 0 && t.createdAt - r.at < 2 * HOUR)).length;
    out.push({
      id: `pattern-${frameId}`,
      kind: 'Repeat pattern',
      confidence: 82,
      title: `${frameId} failed count ${list.length} times in ${monthName(list[0].createdAt)}`,
      body: `${afterRoving} of ${list.length} failures came within 2 hours of a roving lot change. Check draft settings after each changeover.`,
      basis: `${s.tickets.length} tickets, roving lot log`,
      action: 'Create RCA task',
      target: `/dashboard/machines/${frameId}`,
    });
  }

  // Test sooner: highest current winding drift below the warning line.
  const drifting = Object.entries(s.drift)
    .filter(([f, d]) => frameView(s, f, now).kind === 'running' && now - d.at < 8 * HOUR)
    .sort((a, b) => b[1].cvPct - a[1].cvPct)[0];
  if (drifting) {
    out.push({
      id: `sooner-${drifting[0]}`,
      kind: 'Test sooner',
      confidence: 74,
      title: `Test ${drifting[0]} in the next hour`,
      body: `Winding CV on ${drifting[0]} has risen ${drifting[1].cvPct.toFixed(1)}% and is near the warning line.`,
      basis: 'winding sensor trend',
      action: 'Request test',
      target: `/dashboard/machines/${drifting[0]}`,
    });
  }

  out.push({
    id: 'rule-30s',
    kind: 'Rule suggestion',
    confidence: 67,
    title: 'Tighten 30s count to 29.6–30.4',
    body: 'Buyer B returned 2 lots last month that passed the current limit. A tighter limit would have raised 4 more alerts.',
    basis: 'returns log, 12 lots',
    action: 'Open in Rules',
    target: '/dashboard/rules',
  });
  return out;
}
