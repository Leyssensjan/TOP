'use client';

import type { ReactNode } from 'react';

/**
 * The unified detail panel. Every node in every domain expands into this, with
 * the same rows in the same order, because a skate trick, a strength lift and a
 * Form movement are the same kind of object: something that sits somewhere,
 * serves something upstream and opens something downstream.
 *
 * Rows with no content are omitted entirely, never rendered empty.
 */
export interface DetailRow {
  label: string;
  /** Plain text, or links to other nodes in the app. */
  value?: string;
  links?: Array<{ label: string; onClick: () => void }>;
}

export default function Detail({
  rows,
  progress,
  referenceTerm,
  footnote,
}: {
  rows: DetailRow[];
  /** Sits directly above Look up, separated by a hairline. */
  progress?: string;
  referenceTerm?: string;
  footnote?: ReactNode;
}) {
  const filled = rows.filter((r) => (r.value && r.value.trim()) || (r.links && r.links.length));

  return (
    <div className="panel">
      {filled.map((row) => (
        <div className="panel-row" key={row.label}>
          <span className="panel-label">{row.label}</span>
          <span className="panel-value">
            {row.links?.length
              ? row.links.map((link, i) => (
                  <span key={link.label}>
                    {i > 0 && <span style={{ color: 'var(--muted)' }}> · </span>}
                    <button className="panel-link" onClick={link.onClick}>
                      {link.label}
                    </button>
                  </span>
                ))
              : row.value}
          </span>
        </div>
      ))}

      {footnote && <div className="panel-note">{footnote}</div>}

      {(progress || referenceTerm) && <div className="panel-rule" />}

      {progress && (
        <div className="panel-row">
          <span className="panel-label" />
          <span className="panel-value" style={{ color: 'var(--muted)' }}>
            {progress}
          </span>
        </div>
      )}

      {referenceTerm && (
        <a
          className="panel-lookup"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(referenceTerm)}`}
          target="_blank"
          rel="noreferrer"
        >
          Look up →
        </a>
      )}
    </div>
  );
}
