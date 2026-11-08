// Alert sounds made with WebAudio (no files). Browsers only allow sound after a tap,
// so the app calls unlock() from its "Turn on alerts" button.

let ctx: AudioContext | undefined;

export function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio on this device */
  }
}

export const soundReady = () => !!ctx && ctx.state === 'running';

function tone(freq: number, start: number, dur: number, gain: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

/** Critical: three rising pulses (ISA-18.2 style high-priority pattern). */
export function playCritical() {
  [0, 0.18, 0.36].forEach((t, i) => tone(880 + i * 110, t, 0.14, 0.12));
  navigator.vibrate?.([300, 120, 300, 120, 300]);
}

/** Major: one soft two-note chime. */
export function playMajor() {
  tone(660, 0, 0.18, 0.06);
  tone(520, 0.2, 0.24, 0.05);
  navigator.vibrate?.(200);
}
