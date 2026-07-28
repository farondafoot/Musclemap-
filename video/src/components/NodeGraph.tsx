import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, toneColor, Tone } from '../theme';

/**
 * An animated node network — the channel's recurring visual motif.
 *
 * Nodes wake and edges draw between them as the story advances, which reads as
 * a model, a swarm, or a network depending on the story. `intensity` (0-1)
 * drives how much of the graph is live, so it can build across a video.
 */

type Node = { x: number; y: number; r: number };

// Fixed layout so the graph is identical between renders — a random one would
// flicker across shots and break continuity.
const NODES: Node[] = [
  { x: 150, y:  60, r: 7 },
  { x:  52, y: 132, r: 5 },
  { x: 248, y: 128, r: 6 },
  { x: 150, y: 176, r: 11 },
  { x:  36, y: 246, r: 6 },
  { x: 264, y: 250, r: 5 },
  { x: 104, y: 286, r: 8 },
  { x: 196, y: 292, r: 7 },
  { x: 150, y: 372, r: 9 },
  { x:  62, y: 424, r: 5 },
  { x: 240, y: 430, r: 6 },
  { x: 150, y: 486, r: 7 },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 3], [2, 3],
  [1, 4], [2, 5], [3, 6], [3, 7], [4, 6],
  [5, 7], [6, 8], [7, 8], [8, 9], [8, 10],
  [9, 11], [10, 11], [8, 11],
];

export const NodeGraph: React.FC<{
  intensity?: number;
  tone?: Tone;
  startAt?: number;
  scale?: number;
  opacity?: number;
}> = ({ intensity = 1, tone = 'signal', startAt = 0, scale = 1, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = toneColor(tone);

  const liveNodes = Math.round(NODES.length * Math.min(Math.max(intensity, 0), 1));
  const liveEdges = Math.round(EDGES.length * Math.min(Math.max(intensity, 0), 1));

  const settle = spring({
    frame:  frame - startAt,
    fps,
    config: { damping: 200, stiffness: 55, mass: 1.2 },
  });

  return (
    <svg
      width={300 * scale}
      height={540 * scale}
      viewBox="0 0 300 540"
      style={{
        opacity:   opacity * settle,
        transform: `translateY(${interpolate(settle, [0, 1], [30, 0])}px)`,
        overflow:  'visible',
      }}
    >
      {/* Dormant structure, so the shape is legible before it lights */}
      {EDGES.map(([a, b], i) => (
        <line
          key={`base-e-${i}`}
          x1={NODES[a].x} y1={NODES[a].y}
          x2={NODES[b].x} y2={NODES[b].y}
          stroke={theme.b1} strokeWidth={1}
        />
      ))}
      {NODES.map((n, i) => (
        <circle key={`base-n-${i}`} cx={n.x} cy={n.y} r={n.r} fill={theme.s3} stroke={theme.b1} />
      ))}

      {/* Edges draw themselves in */}
      {EDGES.slice(0, liveEdges).map(([a, b], i) => {
        const local = frame - startAt - 10 - i * 2.5;
        const draw  = spring({ frame: local, fps, config: { damping: 200, stiffness: 90, mass: 0.6 } });
        const len   = Math.hypot(NODES[b].x - NODES[a].x, NODES[b].y - NODES[a].y);

        return (
          <line
            key={`live-e-${i}`}
            x1={NODES[a].x} y1={NODES[a].y}
            x2={NODES[b].x} y2={NODES[b].y}
            stroke={color}
            strokeWidth={1.6}
            opacity={0.55 * draw}
            strokeDasharray={len}
            strokeDashoffset={len * (1 - draw)}
          />
        );
      })}

      {/* Nodes wake on a stagger and keep a slow pulse */}
      {NODES.slice(0, liveNodes).map((n, i) => {
        const local = frame - startAt - 6 - i * 3;
        const wake  = spring({ frame: local, fps, config: { damping: 200, stiffness: 140, mass: 0.5 } });
        const pulse = local > 0 ? 0.82 + 0.18 * Math.sin((local + i * 7) / 11) : 0;

        return (
          <circle
            key={`live-n-${i}`}
            cx={n.x} cy={n.y}
            r={n.r * (0.7 + 0.3 * wake)}
            fill={color}
            opacity={wake * pulse}
            style={{ filter: `drop-shadow(0 0 ${10 * wake}px ${color})` }}
          />
        );
      })}
    </svg>
  );
};
