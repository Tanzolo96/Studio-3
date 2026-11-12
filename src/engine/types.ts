// Data model for QC Alert. All times are simulated mill time in epoch ms.

export type Severity = 'critical' | 'major' | 'minor';
export type TestKind = 'count' | 'csp' | 'twist' | 'cv';
export type ShiftId = 'A' | 'B' | 'C';
export type RoleId = 'supervisor' | 'tester' | 'fitter' | 'qc' | 'plant';

export interface User {
  id: string;
  name: string;
  role: RoleId;
  shift: ShiftId | 'G'; // G = general shift (office hours)
  phone?: string;
}

export interface Product {
  id: string;
  name: string; // "30s combed, Buyer B"
  short: string; // "30s"
  nominalNe: number;
  kgPerHour: number; // per ring frame
  cvWarnPct: number; // winding-sensor early-warning threshold (CV rise, %)
}

export interface Lot {
  id: string; // "2417"
  productId: string;
  startedAt: number;
}

export interface Frame {
  id: string; // "RF-12"
  num: number;
  lotId: string;
  stopped?: string; // reason, e.g. "Doffing"
}

export interface Rule {
  id: string;
  productId: string;
  test: TestKind;
  min?: number;
  max?: number;
  severity: Severity;
  seenMins: number;
  escalateQcMins: number;
  escalatePhMins: number;
  updatedAt: number;
  updatedBy: string;
}

export interface TestResult {
  id: string;
  at: number;
  frameId: string;
  lotId: string;
  test: TestKind;
  value: number;
  pass: boolean;
  by: string;
  instrument: string;
  sampleError?: boolean;
  requestId?: string;
}

export type RequestReason = 'drift' | 'sister' | 'retest' | 'manual';

export interface TestRequest {
  id: string;
  at: number;
  frameId: string;
  test: TestKind;
  reason: RequestReason;
  urgent: boolean;
  dueAt: number;
  ticketId?: string;
  holdId?: string;
  status: 'pending' | 'done' | 'cancelled';
  resultId?: string;
}

export type TicketStatus = 'open' | 'seen' | 'working' | 'fixed' | 'closed';
export type TicketKind = 'test_fail' | 'drift' | 'manual';
export type CloseReason = 'fixed' | 'checked_ok' | 'sample_error';

export interface Reading {
  resultId?: string;
  test: TestKind;
  value: number;
  min?: number;
  max?: number;
  at: number;
}

export type TicketEventKind =
  | 'created'
  | 'alerted'
  | 'contained'
  | 'reading_added'
  | 'upgraded'
  | 'seen'
  | 'working'
  | 'fitter_assigned'
  | 'repair_done'
  | 'fixed'
  | 'closed'
  | 'escalated'
  | 'sample_error'
  | 'handover'
  | 'note';

export interface TicketEvent {
  at: number;
  kind: TicketEventKind;
  text: string;
  by?: string; // user id or 'system'
}

export interface Ticket {
  id: string; // "T-1042"
  createdAt: number;
  alertAt: number; // when the current alert started (resets if a drift ticket is raised to critical)
  frameId: string;
  lotId: string;
  productId: string;
  kind: TicketKind;
  severity: Severity;
  title: string;
  test?: TestKind;
  readings: Reading[];
  status: TicketStatus;
  shift: ShiftId;
  seenMins: number;
  escalateQcMins: number;
  escalatePhMins: number;
  seenAt?: number;
  seenBy?: string;
  workingAt?: number;
  fitterId?: string;
  repairDoneAt?: number;
  fixedAt?: number;
  fixedBy?: string;
  cause?: string;
  note?: string;
  photo?: string;
  closedAt?: number;
  closeReason?: CloseReason;
  holdId?: string;
  sisterFrames: string[];
  raisedBy?: string;
  handover?: string;
  events: TicketEvent[];
}

export type HoldOutcome = 'release' | 'retest' | 'reprocess' | 'downgrade';
export type HoldStatus = 'on_hold' | 'released' | 'reprocess' | 'downgrade';

export interface Decision {
  at: number;
  by: string;
  outcome: HoldOutcome;
  reason: string;
  needsApproval: boolean;
  approvedBy?: string;
  approvedAt?: number;
}

export interface Hold {
  id: string; // "H-311"
  ticketId: string;
  frameId: string;
  lotId: string;
  from: number;
  to?: number; // set when the frame is fixed; until then the hold keeps growing
  kgPerHour: number;
  status: HoldStatus;
  retest?: 'pending' | 'passed' | 'failed';
  decisions: Decision[];
  closedAt?: number;
}

export interface Clock {
  simAt: number; // sim time at anchor
  realAt: number; // wall time at anchor
  speed: number; // 0 = paused
}

export interface MillState {
  clock: Clock;
  users: User[];
  products: Product[];
  lots: Lot[];
  frames: Frame[];
  rules: Rule[];
  results: TestResult[];
  requests: TestRequest[];
  tickets: Ticket[];
  holds: Hold[];
  drift: Record<string, { cvPct: number; at: number }>; // latest winding-sensor drift per frame
  rovingChanges: { frameId: string; at: number }[];
  seq: { ticket: number; hold: number; request: number; result: number };
}

// ---- Events (the log). Every change goes through one of these. ----
type Base = { id: string; at: number; by: string };

export type MillEvent = Base &
  (
    | { type: 'clock/set'; simAt: number; realAt: number; speed: number }
    | { type: 'sim/drift'; frameId: string; cvPct: number }
    | { type: 'result/enter'; frameId: string; test: TestKind; value: number; requestId?: string }
    | { type: 'result/sampleError'; resultId: string }
    | { type: 'ticket/seen'; ticketId: string }
    | { type: 'ticket/working'; ticketId: string }
    | { type: 'ticket/assignFitter'; ticketId: string; fitterId: string }
    | { type: 'ticket/repairDone'; ticketId: string }
    | { type: 'ticket/fixed'; ticketId: string; cause: string; note?: string; photo?: string }
    | { type: 'ticket/raise'; frameId: string; problem: string; severity: Severity; note?: string; photo?: string }
    | { type: 'ticket/handover'; ticketId: string; note: string }
    | { type: 'test/ask'; ticketId: string; test: TestKind }
    | { type: 'rule/set'; ruleId: string; min?: number; max?: number; severity: Severity; escalateQcMins: number; escalatePhMins: number }
    | { type: 'hold/retest'; holdId: string }
    | { type: 'hold/decide'; holdId: string; outcome: Exclude<HoldOutcome, 'retest'>; reason: string }
    | { type: 'hold/approve'; holdId: string }
  );

export type MillEventInput = MillEvent extends infer E
  ? E extends MillEvent
    ? Omit<E, 'id' | 'at'>
    : never
  : never;
