'use client';

export interface ThreadNode {
  slot: number;
  /** In today's session, as opposed to a slot that has not unlocked yet. */
  inPlay: boolean;
  /** Unlocked, but sitting out today — a Flow Short leaves six of these. */
  active: boolean;
  level: number;
  done: boolean;
  current: boolean;
}

/**
 * The Form as one continuous vertical thread. It always shows twelve nodes,
 * never six and never the number in today's session, because the whole point is
 * that a short session visibly sits inside the same structure as a long one.
 *
 * It is unbroken because the sequence is unbroken: slot 12 exits standing and
 * slot 1 enters standing, so the thread closes into a loop. States are told
 * apart by size and weight, not by colour alone — colour is unreliable at the
 * screen brightness this is read at.
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
          data-active={node.active}
          data-done={node.done}
          data-current={node.current}
        />
      ))}
    </div>
  );
}
