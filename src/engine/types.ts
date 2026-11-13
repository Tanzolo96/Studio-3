// Data model for QC Alert. All times are simulated mill time in epoch ms.

export type Severity = 'critical' | 'major' | 'minor';
export type TestKind = 'count' | 'csp' | 'twist' | 'cv';
export type ShiftId = 'A' | 'B' | 'C';
export type RoleId = 'operator' | 'supervisor' | 'tester' | 'fitter' | 'qc' | 'plant';

export interface User {
  id: string;
  name: string;
  role: RoleId;
  shift: ShiftId | 'G'; // G = general shift (office hours)
  phone?: string;
  email?: string;
  gender?: 'Male' | 'Female' | 'Other';
  /** Employee number, as on the mill's ID card. */
  empId?: string;
  department?: string;
  /** Month they joined the mill, "2019-06". */
  joined?: string;
  languages?: string[];
  /** Who they report to (user id). */
  reportsTo?: string;
  /** Frames this person looks after (by number, inclusive). Unset = the whole floor. */
  frames?: [number, number];
}

export interface Product {
  id: string;
  name: string; // "30s combed, Buyer B"
  short: string; // "30s"
  nominalNe: number;
  kgPerHour: number; // per ring frame
  cvWarnPct: number; // winding-sensor early-warning threshold (CV rise, %)
  buyer: string; // "Buyer B"
}

export interface Lot {
  id: string; // "2417"
  productId: string;
  startedAt: number;
  dispatchAt?: number; // when this lot must leave for the buyer
}

export interface Frame {
  id: string; // "RF-12"
  num: number;
  lotId: string;
  stopped?: string; // reason, e.g. "Doffing"
  make: string; // machine brand and model, e.g. "LMW LR 9 AX"
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
  /** The file this limit came from, when it was added as part of a rule set. */
  source?: string;
}

/** One limit in a rule set: a test, its range and how serious a fail is. */
export interface SetLimit {
  test: TestKind;
  min?: number;
  max?: number;
  severity: Severity;
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
  | 'waiting_part'
  | 'sisters'
  | 'tagged'
  | 'stopped'
  | 'confirmed'
  | 'reopened'
  | 'decision'
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
  /** Fixed and waiting for a spare part: escalation does not apply, the board shows the wait. */
  waitingPart?: string;
  /** Fixed without a known cause: a root-cause check is open and repeats are watched. */
  rca?: boolean;
  /** Supervisor answered "which other frames run this lot?" (may be none). */
  sistersAskedAt?: number;
  /** Supervisor stopped the frame, or corrected it while running. */
  lineAction?: 'stopped' | 'corrected';
  lineActionAt?: number;
  /** The lab re-test after Fixed passed. Nothing closes on a promise. */
  fixConfirmedAt?: number;
  /** How many times a failed re-test sent this ticket back to the line. */
  reopened?: number;
  /** Fix report: which part of the machine needed fixing. */
  part?: string;
  /** Fix report: when the frame was last OK (last passing test), and the yarn it made on this lot since then. */
  affectedSince?: number;
  affectedKg?: number;
  waitingParts?: { at: number; note: string };
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
  approvedReason?: string;
  sentBack?: { by: string; at: number; reason: string };
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
  /** The supervisor put the red hold tag on the cops. Until then the hold exists only on screen. */
  taggedAt?: number;
  taggedBy?: string;
  /** After the decision: the supervisor moved the yarn on (or kept it) and removed the tag. */
  movedAt?: number;
}

export type FrameOutcome = 'overhaul' | 'procedure' | 'watch';

export interface FrameDecision {
  id: string;
  at: number;
  by: string;
  frameId: string;
  outcome: FrameOutcome;
  reason: string;
}

export interface Clock {
  simAt: number; // sim time at anchor
  realAt: number; // wall time at anchor
  speed: number; // 0 = paused
}

export interface RulesDoc {
  name: string;
  at: number;
  by: string;
  pages: number;
  /** Rules read from the document, as plain sentences. */
  found: string[];
  /** How many of them the QC manager applied. */
  applied: number;
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
  frameDecisions: FrameDecision[];
  /** Rules documents dropped on the Rules page, with the rules read from each. */
  rulesDocs: RulesDoc[];
  seq: { ticket: number; hold: number; request: number; result: number };
}

// ---- Events (the log). Every change goes through one of these. ----
type Base = { id: string; at: number; by: string };

export type MillEvent = Base &
  (
    | { type: 'clock/set'; simAt: number; realAt: number; speed: number }
    | { type: 'sim/drift'; frameId: string; cvPct: number }
    | { type: 'result/enter'; frameId: string; test: TestKind; value: number; requestId?: string; lastPassAt?: number }
    | { type: 'result/sampleError'; resultId: string }
    | { type: 'ticket/seen'; ticketId: string }
    | { type: 'ticket/working'; ticketId: string }
    | { type: 'ticket/assignFitter'; ticketId: string; fitterId: string }
    | { type: 'ticket/repairDone'; ticketId: string }
    | { type: 'ticket/fixed'; ticketId: string; cause: string; part?: string; note?: string; photo?: string; affectedSince?: number; affectedKg?: number }
    | { type: 'routing/set'; backupMins: number; qcMins: number; plantMins: number }
    | { type: 'rules/doc'; name: string; pages: number; found: string[]; applied: number }
    /** Add a rule set (one yarn for one buyer). Replaces that yarn's limits if it already has some. */
    | { type: 'ruleset/add'; yarn: string; buyer: string; source: string; limits: SetLimit[] }
    /** Remove a whole rule set: every limit for that yarn. */
    | { type: 'ruleset/remove'; productId: string }
    /** Remove one limit from a set. The last one out removes the set. */
    | { type: 'rule/remove'; ruleId: string }
    | { type: 'ticket/raise'; frameId: string; problem: string; severity: Severity; note?: string; photo?: string }
    | { type: 'ticket/handover'; ticketId: string; note: string }
    | { type: 'ticket/sisters'; ticketId: string; frameIds: string[] }
    | { type: 'ticket/line'; ticketId: string; action: 'stopped' | 'corrected' }
    | { type: 'hold/tag'; holdId: string }
    | { type: 'hold/moved'; holdId: string }
    | { type: 'ticket/waitPart'; ticketId: string; part: string }
    | { type: 'ticket/partArrived'; ticketId: string }
    | { type: 'test/ask'; ticketId: string; test: TestKind }
    | { type: 'rule/set'; ruleId: string; min?: number; max?: number; severity: Severity; escalateQcMins: number; escalatePhMins: number }
    | { type: 'hold/retest'; holdId: string }
    | { type: 'hold/decide'; holdId: string; outcome: Exclude<HoldOutcome, 'retest'>; reason: string }
    | { type: 'hold/approve'; holdId: string; reason?: string }
    | { type: 'hold/sendBack'; holdId: string; reason: string }
    | { type: 'frame/decide'; frameId: string; outcome: FrameOutcome; reason: string }
    | { type: 'ticket/needsParts'; ticketId: string; note: string }
  );

export type MillEventInput = MillEvent extends infer E
  ? E extends MillEvent
    ? Omit<E, 'id' | 'at'>
    : never
  : never;
