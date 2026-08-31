'use client';

// Pacing cues for the Runner. The phone is propped up and the eyes are often
// shut — during Centering they are meant to be — so a silent rollover leaves no
// way to know a movement has ended. These are the only sounds in the app: no
// notifications, nothing outside a running session.

import { SOUND } from '@/lib/config';

const MUTED = 'fq.muted';

type Ctx = AudioContext & { resume: () => Promise<void> };

let ctx: Ctx | null = null;

function context(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor() as Ctx;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * iOS only lets audio start from inside a user gesture, and the gesture that
 * begins a session is the Start tap on Today — one navigation before the Runner
 * exists. Creating and resuming the context there is what makes the first cue of
 * the session audible instead of silently swallowed.
 */
export function unlockSound(): void {
  const c = context();
  if (!c) return;
  void c.resume().catch(() => {});
  // A silent blip completes the unlock on the stricter iOS versions.
  try {
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    const osc = c.createOscillator();
    osc.connect(gain);
    osc.start();
    osc.stop(c.currentTime + 0.01);
  } catch {
    // An unlock that fails only costs the cues, never the session.
  }
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTED) === 'yes';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED, muted ? 'yes' : 'no');
  } catch {
    // A blocked localStorage just means the setting does not persist.
  }
}

/**
 * One soft sine tone. Short, low, and with its edges ramped — a hard square
 * edge reads as an alarm, which is the opposite of what a 6am room wants.
 */
function tone(frequency: number, ms: number, volume: number, delay = 0): void {
  const c = context();
  if (!c) return;
  try {
    const at = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.linearRampToValueAtTime(0, at + ms / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(at);
    osc.stop(at + ms / 1000 + 0.02);
  } catch {
    // Never let a missing cue interrupt a session.
  }
}

export type Cue = 'warn' | 'next' | 'round' | 'rest' | 'done';

/**
 * Play a pacing cue. Silent when muted, and never throws.
 *
 * The context is resumed on the way in. Unlocking it once on the Start tap is
 * not enough to keep it awake: iOS suspends it again whenever the tab loses the
 * foreground — a glance at a notification mid-Flow is enough — and a suspended
 * context accepts every scheduled tone and plays none of them, without an error
 * anywhere. The session carries on looking correct and goes quiet, which is
 * exactly the failure that is hardest to notice from the code and impossible to
 * miss on the mat.
 */
export function cue(name: Cue): void {
  if (isMuted()) return;
  const spec = SOUND.cues[name];
  if (!spec) return;
  const play = () =>
    spec.tones.forEach((t, i) => tone(t.hz, t.ms, SOUND.volume * t.gain, i * (SOUND.gapMs / 1000)));

  const c = context();
  if (c && c.state === 'suspended') {
    // A few milliseconds late is nothing measured against not arriving.
    void c.resume().then(play).catch(play);
    return;
  }
  play();
}
