'use client';

export interface ThreadNode {
  slot: number;
  /** In today's session, as opposed to a slot that has not unlocked yet. */
  inPlay: boolean;
  level: number;
  done: boolean;
  current: boolean;
}

/**
 * The Form as one continuous vertical thread with twelve nodes. It is unbroken
 * because the sequence is unbroken: slot 12 exits standing and slot 1 enters
 * standing, so the thread closes into a loop. It fills as the session runs and
 * each node deepens as its slot levels up.
 */
export default function Thread({ nodes, progress }: { nodes: ThreadNode[]; progress: number }) {
  const total = nodes.length;
  const pos = (i: number) => (total <= 1 ? 0 : (i / (total - 1)) * 100);

  return (
    <div className="thread" aria-hidden="true">
      <div className="thread-line" />
      <div className="thread-fill" style={{ height: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
      {nodes.map((node, i) => (
        <div
          key={node.slot}
          className="thread-node"
          style={{ top: `${pos(i)}%`, ['--level' as string]: node.level }}
          data-inplay={node.inPlay}
          data-done={node.done}
          data-current={node.current}
        />
      ))}
    </div>
  );
}
