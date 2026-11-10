import { useState } from 'react';
import { Close, Pause, Play, Renew } from '@carbon/icons-react';
import { useMill, useMillState, useNow } from '../store/store';
import { productOfFrame } from '../engine/reducer';
import { dateTime, shiftAt } from '../engine/time';
import { Button, cx } from '../ui/primitives';

/** Simulated lab instruments and winding sensors. Demo only, clearly labelled. */
export function SimulatorDock() {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem('qc.sim.open') === '1';
    } catch {
      return false;
    }
  });
  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      sessionStorage.setItem('qc.sim.open', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => toggle(!open)}
        aria-expanded={open}
        className="t-small-strong mb-2 flex h-10 w-full items-center justify-between rounded-[10px] border border-dashed border-line-strong px-3 text-ink hover:bg-raised"
      >
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--ai)]" aria-hidden />
          Simulator
        </span>
        <span className="t-small text-muted">demo</span>
      </button>
      {open && (
        <div className="fixed bottom-4 left-[244px] z-[var(--z-dock)]">
          <SimulatorPanel onClose={() => toggle(false)} />
        </div>
      )}
    </>
  );
}

function SimulatorPanel({ onClose }: { onClose: () => void }) {
  const s = useMillState();
  const now = useNow();
  const { dispatch, setSpeed, skip, reset } = useMill.getState();
  const [frame, setFrame] = useState('RF-12');
  const [value, setValue] = useState('28.9');
  const [confirm, setConfirm] = useState(false);
  const speed = s.clock.speed;
  const product = productOfFrame(s, frame);
  const pending = s.requests.filter((r) => r.status === 'pending');
  const forFrame = pending.find((r) => r.frameId === frame && r.reason !== 'sister') ?? pending.find((r) => r.frameId === frame);
  const lastFail = [...s.results].reverse().find((r) => !r.pass && !r.sampleError);

  return (
    <section aria-label="Simulator" className="anim-slide w-[340px] rounded-[16px] border border-line bg-raised shadow-sheet">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="t-body-strong">Simulator</p>
          <p className="t-small text-muted">Demo only · stands in for the lab and sensors</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close simulator" className="grid size-10 place-items-center rounded-[10px] text-muted hover:bg-sunken">
          <Close size={20} />
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <p className="t-small-strong text-muted">Mill clock</p>
          <p className="mt-1 flex items-baseline justify-between">
            <span className="t-stat">{dateTime(now).split(', ')[1]}</span>
            <span className="t-small text-muted">
              {shiftAt(now)} shift · {dateTime(now).split(', ')[0]}
            </span>
          </p>
          <div role="radiogroup" aria-label="Demo speed" className="mt-2 grid grid-cols-4 gap-1 rounded-[10px] bg-sunken p-1">
            {[0, 1, 10, 60].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={speed === v}
                onClick={() => setSpeed(v)}
                className={cx('t-small-strong flex h-8 items-center justify-center gap-1 rounded-[6px]', speed === v ? 'bg-raised text-ink shadow-raised' : 'text-muted hover:text-ink')}
              >
                {v === 0 ? <Pause size={16} aria-label="Pause" /> : v === 1 ? <><Play size={14} aria-hidden />1×</> : `${v}×`}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => skip(5)}>
              Skip 5 min
            </Button>
            <Button variant="secondary" onClick={() => skip(10)}>
              Skip 10 min
            </Button>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <label htmlFor="sim-frame" className="t-small-strong text-muted">
            Ring frame
          </label>
          <select id="sim-frame" value={frame} onChange={(e) => setFrame(e.target.value)} className="mt-1.5 h-10 w-full rounded-[10px] border border-line-strong bg-raised px-3 t-data">
            {s.frames.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {productOfFrame(s, f.id).short} · Lot {f.lotId}
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="secondary" onClick={() => dispatch({ type: 'sim/drift', frameId: frame, cvPct: product.cvWarnPct + 0.4, by: 'system' })}>
              Winding sensor drift (CV +{(product.cvWarnPct + 0.4).toFixed(1)}%)
            </Button>
            <div className="flex gap-2">
              <input
                aria-label="Count reading"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                className="h-10 w-20 rounded-[10px] border border-line-strong bg-raised px-2 t-data"
              />
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const v = Number(value);
                  if (Number.isNaN(v)) return;
                  dispatch({ type: 'result/enter', frameId: frame, test: forFrame?.test ?? 'count', value: v, requestId: forFrame?.id, by: 'rohan' });
                }}
              >
                Enter lab result
              </Button>
            </div>
            {forFrame && <p className="t-small -mt-1 text-muted">Answers the open {forFrame.reason === 'retest' ? 're-test' : 'urgent test'} on {frame}</p>}
            <Button
              variant="secondary"
              disabled={!pending.some((r) => r.reason === 'sister')}
              onClick={() =>
                pending
                  .filter((r) => r.reason === 'sister')
                  .forEach((r) => dispatch({ type: 'result/enter', frameId: r.frameId, test: r.test, value: productOfFrame(s, r.frameId).nominalNe + 0.1, requestId: r.id, by: 'rohan' }))
              }
            >
              Sister frames pass
            </Button>
            <Button variant="secondary" disabled={!lastFail} onClick={() => lastFail && dispatch({ type: 'result/sampleError', resultId: lastFail.id, by: 'rohan' })}>
              Last fail was a sample error
            </Button>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          {confirm ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                Reset to 09:40
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Keep going
              </Button>
            </div>
          ) : (
            <Button variant="ghost" icon={<Renew size={16} />} onClick={() => setConfirm(true)}>
              Reset demo
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
