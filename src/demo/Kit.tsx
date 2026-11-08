import type { ReactNode } from 'react';
import { useMillState, useNow } from '../store/store';
import { insights } from '../engine/insights';
import { Button, SeverityBadge, StatusChip, TextField, type ChipKind } from '../ui/primitives';
import { FrameTile, InsightCard, ReadingGauge, ResponseTimer, StatTile, TicketCard } from '../ui/cards';

/** Every component in Day and Night, for checking against the Figma Components page. */
export function Kit() {
  return (
    <div className="grid min-h-dvh grid-cols-2">
      <Panel theme="day" />
      <Panel theme="night" />
    </div>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="t-section mb-3">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

function Panel({ theme }: { theme: 'day' | 'night' }) {
  const s = useMillState();
  const now = useNow();
  const t = [...s.tickets].reverse();
  const crit = t.find((x) => x.severity === 'critical')!;
  const major = t.find((x) => x.severity === 'major')!;
  const minor = t.find((x) => x.severity === 'minor')!;
  const ins = insights(s, now);
  const chips: ChipKind[] = ['open', 'seen', 'working', 'fixed', 'closed', 'escalated', 'on_hold', 'released'];
  return (
    <div data-theme={theme} className="bg-surface p-8 text-ink">
      <h1 className="t-page mb-6">{theme === 'day' ? 'Day shift' : 'Night shift'}</h1>
      <Row title="SeverityBadge">
        <SeverityBadge level="critical" />
        <SeverityBadge level="major" />
        <SeverityBadge level="minor" />
      </Row>
      <Row title="StatusChip">
        {chips.map((c) => (
          <StatusChip key={c} kind={c} />
        ))}
      </Row>
      <Row title="Button">
        <Button>Save rule</Button>
        <Button variant="secondary">Save rule</Button>
        <Button variant="danger">Save rule</Button>
        <Button variant="ghost">Save rule</Button>
      </Row>
      <Row title="TextField">
        <TextField label="Lower limit" unit="Ne" defaultValue="29.4" />
        <TextField label="Upper limit" unit="Ne" defaultValue="29.2" error="Upper limit must be higher than lower limit" />
      </Row>
      <Row title="TicketCard">
        {[crit, major, minor].map((x) => (
          <div key={x.id} className="w-[328px]">
            <TicketCard s={s} t={x} now={x.closedAt ?? now} />
          </div>
        ))}
      </Row>
      <Row title="FrameTile">
        {['RF-11', 'RF-17', 'RF-04'].map((f) => (
          <div key={f} className="w-[168px]">
            <FrameTile s={s} frameId={f} now={now} />
          </div>
        ))}
      </Row>
      <Row title="StatTile">
        <div className="w-[208px]">
          <StatTile label="Median time to Seen" value="2:40" delta="38 s faster than Oct" trend="good" />
        </div>
        <div className="w-[208px]">
          <StatTile label="Yarn on hold" value={186} unit="kg" delta="3 lots waiting" trend="bad" />
        </div>
        <div className="w-[208px]">
          <StatTile label="Alerts this month" value={27} delta="4 escalated" />
        </div>
      </Row>
      <Row title="InsightCard">
        {ins.slice(0, 2).map((i) => (
          <div key={i.id} className="w-[360px]">
            <InsightCard insight={i} onDismiss={() => {}} />
          </div>
        ))}
      </Row>
      <Row title="ReadingGauge">
        <div className="w-[300px]">
          <ReadingGauge test="count" value={30.1} min={29.4} max={30.6} />
        </div>
        <div className="w-[300px]">
          <ReadingGauge test="count" value={28.9} min={29.4} max={30.6} />
        </div>
      </Row>
      <Row title="ResponseTimer">
        <div className="w-[300px]">
          <ResponseTimer elapsed={72_000} limitMins={5} state="ok" level={0} />
        </div>
        <div className="w-[300px]">
          <ResponseTimer elapsed={236_000} limitMins={5} state="warn" level={0} />
        </div>
        <div className="w-[300px]">
          <ResponseTimer elapsed={318_000} limitMins={5} state="over" level={0} />
        </div>
      </Row>
    </div>
  );
}
