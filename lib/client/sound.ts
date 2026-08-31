'use client';

// Pacing cues for the Runner. The phone is propped up and the eyes are often
// shut — during Centering they are meant to be — so a silent rollover leaves no
// way to know a movement has ended. These are the only sounds in the app: no
// notifications, nothing outside a running session.
//
// They play through an <audio> element rather than straight out of the Web
// Audio context, because iOS files Web Audio under ambient sound and the
// ring/silent switch mutes it outright. A phone that lives on silent — which is
// most phones, and certainly one being used at 6am — would run the whole Form
// without a single cue, with the toggle cheerfully reading "Sound on". Media
// playback is not muted by that switch, so the tones are rendered to a small
// WAV and handed to an element. The Web Audio path stays as the fallback for
// anywhere the element cannot play.

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
  // Priming each element inside the gesture is what lets a cue play later
  // without one. Muted for the priming pass so it is not audible here.
  (Object.keys(SOUND.cues) as Cue[]).forEach((name) => {
    const el = player(name);
    if (!el) return;
    try {
      el.muted = true;
      void el
        .play()
        ?.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        })
        .catch(() => {
          el.muted = false;
        });
    } catch {
      el.muted = false;
    }
  });

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
 * The oscillator rendering, now the fallback rather than the way in.
 *
 * The context is resumed on the way in. Unlocking it once on the Start tap is
 * not enough to keep it awake: iOS suspends it again whenever the tab loses the
 * foreground — a glance at a notification mid-Flow is enough — and a suspended
 * context accepts every scheduled tone and plays none of them, without an error
 * anywhere. The session carries on looking correct and goes quiet.
 */
function toneCue(name: Cue): void {
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

// --- the cues as media -------------------------------------------------------

/** The tones top out near 1kHz, so this is ample and keeps the URIs small. */
const RATE = 22050;

/**
 * One cue rendered to a 16-bit mono WAV data URI. Synthesised rather than
 * shipped as files, so SOUND stays the single place a cue is described, and the
 * level is baked into the samples because iOS ignores HTMLAudioElement.volume.
 *
 * Exported for the verifier. A malformed header or a clipped envelope fails by
 * the element silently declining to play, which on a silent phone is
 * indistinguishable from the bug this exists to fix.
 */
export function renderWav(tones: Array<{ hz: number; ms: number; gain: number }>): string {
  const totalMs = tones.reduce((sum, t, i) => sum + t.ms + (i ? SOUND.gapMs : 0), 0);
  const pcm = new Int16Array(Math.ceil((totalMs / 1000) * RATE));

  let at = 0;
  tones.forEach((t, i) => {
    if (i) at += Math.round((SOUND.gapMs / 1000) * RATE);
    const samples = Math.round((t.ms / 1000) * RATE);
    const peak = SOUND.volume * t.gain;
    // The same ramped edges the oscillator had: a hard square edge reads as an
    // alarm, which is the opposite of what a dim room at 6am wants.
    const ramp = Math.min(Math.round(0.012 * RATE), Math.floor(samples / 2));
    for (let n = 0; n < samples; n += 1) {
      const envelope = n < ramp ? n / ramp : 1 - (n - ramp) / Math.max(1, samples - ramp);
      const value = Math.sin((2 * Math.PI * t.hz * n) / RATE) * peak * envelope;
      pcm[at + n] = Math.round(Math.max(-1, Math.min(1, value)) * 0x7fff);
    }
    at += samples;
  });

  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(44 + i * 2, pcm[i], true);

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const players = new Map<string, HTMLAudioElement>();

function player(name: Cue): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const made = players.get(name);
  if (made) return made;
  const spec = SOUND.cues[name];
  if (!spec) return null;
  try {
    const el = new Audio(renderWav(spec.tones));
    el.preload = 'auto';
    players.set(name, el);
    return el;
  } catch {
    return null;
  }
}

/** Play a pacing cue. Silent when muted, and never throws. */
export function cue(name: Cue): void {
  if (isMuted()) return;
  const el = player(name);
  if (!el) {
    toneCue(name);
    return;
  }
  try {
    el.currentTime = 0;
    // Rejects when the element was never primed by a gesture. The oscillator is
    // no use against the silent switch, but it is the better answer everywhere
    // else, so it catches the fall rather than nothing catching it.
    void el.play()?.catch(() => toneCue(name));
  } catch {
    toneCue(name);
  }
}
