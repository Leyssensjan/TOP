'use client';

// The shell every screen sits in. Before this, each screen invented its own
// header, its own spacing and its own way of getting somewhere else, which is
// most of what read as ugly rather than any single wrong value.

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The five screens worth a tab. Everything else — Micros, Strength, Progress,
 * Routes, Runner, Close — is pushed, and gets a back arrow instead of a bar,
 * because a screen you came to deliberately should say how to leave rather than
 * offer four places you did not ask for.
 */
const TABS = [
  { href: '/', label: 'Today' },
  { href: '/week', label: 'Week' },
  { href: '/form', label: 'Form' },
  { href: '/skate', label: 'Skate' },
  { href: '/profile', label: 'You' },
] as const;

export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav className="tabbar">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <button
            key={tab.href}
            className="tab"
            aria-current={active ? 'page' : undefined}
            onClick={() => router.push(tab.href)}
          >
            <span className="tab-dot" />
            <span className="tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The header. One name on the left, one action or one fact on the right, and
 * nothing else — the old wrapping list of five text links is what the tab bar
 * replaced.
 */
export function Header({
  title,
  back,
  backTo = '/',
  right,
}: {
  title: string;
  /** Pushed screens carry the arrow. Tab screens do not. */
  back?: boolean;
  backTo?: string;
  /** Amber when it is tappable, muted when it is a fact. */
  right?: ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="app-header">
      {back ? (
        <button className="eyebrow" onClick={() => router.push(backTo)} style={{ padding: '10px 12px 10px 0' }}>
          ‹ {title}
        </button>
      ) : (
        <span className="eyebrow">{title}</span>
      )}
      {right ?? <span />}
    </header>
  );
}

/** A right-hand header action. Amber, because it can be tapped. */
export function HeaderAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="eyebrow eyebrow-action" onClick={onClick} style={{ padding: '10px 0 10px 12px' }}>
      {children}
    </button>
  );
}

/** A right-hand header fact. Muted, because it is not going anywhere. */
export function HeaderFact({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

/**
 * A section: an eyebrow, optionally with one action opposite it, over content.
 */
export function Section({
  title,
  action,
  children,
  gap = 10,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span className="eyebrow">{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The hero: a number, its unit on the same baseline, and a meta line under
 * both. The unit used to sit on its own baseline and the meta line used to wrap
 * around the number.
 */
export function Hero({
  value,
  unit,
  meta,
  tone,
}: {
  value: ReactNode;
  unit: string;
  meta?: ReactNode;
  /** Sage when the day is done, muted on a planned rest. Amber otherwise. */
  tone?: 'amber' | 'sage' | 'muted';
}) {
  const colour = tone === 'sage' ? 'var(--sage)' : tone === 'muted' ? 'var(--muted)' : 'var(--amber)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="hero">
        <span className="hero-num" style={{ color: colour }}>
          {value}
        </span>
        <span className="hero-unit">{unit}</span>
      </div>
      {meta ? <div className="hero-meta">{meta}</div> : null}
    </div>
  );
}

/** Two or three equal cells. Bare numbers with tiny captions became these. */
export function Cells({ children, columns }: { children: ReactNode; columns: number }) {
  return (
    <div className="cells" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {children}
    </div>
  );
}

export function Cell({ value, caption, tone }: { value: ReactNode; caption: string; tone?: 'amber' | 'sage' | 'text' }) {
  const colour = tone === 'amber' ? 'var(--amber)' : tone === 'sage' ? 'var(--sage)' : 'var(--text)';
  return (
    <div className="cell">
      <div className="cell-num" style={{ color: colour }}>
        {value}
      </div>
      <div className="cell-cap">{caption}</div>
    </div>
  );
}

/**
 * A segmented control. Replaces the loose pill groups, which drifted to the
 * left of the screen and never lined up with anything.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A pip bar: a filled track overlaid with notches, so a level reads as steps
 * taken out of steps available rather than as a percentage of nothing.
 */
export function Pips({
  filled,
  total,
  segments,
  height = 14,
  gradient = false,
}: {
  filled: number;
  total: number;
  /** Notches drawn, when that is not the same as the scale being measured. The
   *  XP bar spans a couple of hundred points and wants twenty. */
  segments?: number;
  height?: number;
  gradient?: boolean;
}) {
  const step = 100 / Math.max(1, segments ?? total);
  const pct = Math.max(0, Math.min(1, total ? filled / total : 0)) * 100;
  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 3,
        background: '#131d29',
        border: '1px solid var(--card-line)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${pct}%`,
          background: gradient ? 'linear-gradient(90deg, var(--amber-dim), var(--amber))' : 'var(--amber)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(90deg, transparent 0 calc(${step}% - 2px), var(--ink) calc(${step}% - 2px) ${step}%)`,
        }}
      />
    </div>
  );
}
