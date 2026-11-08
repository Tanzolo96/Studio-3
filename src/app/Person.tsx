import { Asleep, Light } from '@carbon/icons-react';
import type { RoleId, User } from '../engine/types';
import { useMillState, useSession } from '../store/store';
import { Button, Choice, cx } from '../ui/primitives';
import { Sheet } from './Sheet';

export const ROLE_WORD: Record<RoleId, string> = {
  supervisor: 'Shift supervisor',
  tester: 'Lab tester',
  fitter: 'Fitter',
  qc: 'QC manager',
  plant: 'Plant head',
};

const DEMO_PEOPLE = ['krish', 'rohan', 'suresh', 'priya', 'mohit'];

function PeoplePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const s = useMillState();
  const people = DEMO_PEOPLE.map((id) => s.users.find((u) => u.id === id)!) as User[];
  return (
    <div role="radiogroup" aria-label="Who is using this phone" className="flex flex-col gap-2">
      {people.map((u) => (
        <Choice key={u.id} selected={value === u.id} onClick={() => onPick(u.id)} className="flex items-center justify-between">
          <span>
            <span className="block">{u.name}</span>
            <span className="t-small text-muted">
              {ROLE_WORD[u.role]}
              {u.shift !== 'G' ? ` · ${u.shift} shift` : ''}
            </span>
          </span>
        </Choice>
      ))}
    </div>
  );
}

export function PersonSheet({ onClose }: { onClose: () => void }) {
  const { userId, theme, setUser, setTheme } = useSession();
  return (
    <Sheet title="This phone" onClose={onClose}>
      <p className="t-small-strong mb-2 text-muted">Who is using it (demo)</p>
      <PeoplePicker
        value={userId.app}
        onPick={(id) => {
          setUser('app', id);
          onClose();
        }}
      />
      <p className="t-small-strong mt-6 mb-2 text-muted">Screen</p>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
        <Choice selected={theme.app === 'day'} onClick={() => setTheme('app', 'day')} className="flex items-center gap-2">
          <Light size={20} /> Day shift
        </Choice>
        <Choice selected={theme.app === 'night'} onClick={() => setTheme('app', 'night')} className="flex items-center gap-2">
          <Asleep size={20} /> Night shift
        </Choice>
      </div>
    </Sheet>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { userId, setUser } = useSession();
  return (
    <div className="absolute inset-0 z-[var(--z-takeover)] flex flex-col overflow-y-auto bg-surface px-5 pt-12 pb-6">
      <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="12" fill="var(--ink)" />
        <path d="M32 13 54 51H10Z" fill="var(--critical)" />
      </svg>
      <h1 className="t-page mt-5">QC Alert</h1>
      <p className="t-body mt-2 text-muted">Yarn faults reach you here the minute the lab or the winding sensor finds them.</p>
      <p className="t-small-strong mt-8 mb-2 text-muted">Who is using this phone?</p>
      <PeoplePicker value={userId.app} onPick={(id) => setUser('app', id)} />
      <div className={cx('mt-auto pt-6')}>
        <Button size="lg" block onClick={onDone}>
          Turn on alerts
        </Button>
        <p className="t-small mt-2 text-center text-muted">Alerts ring with sound, so keep the volume up.</p>
      </div>
    </div>
  );
}
