import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

/**
 * Stylised front-facing body silhouette with individually lightable muscle
 * groups — the visual signature of the app's heat map.
 *
 * `active` names which groups light up; they ignite on a stagger so the map
 * fills in rather than switching on all at once.
 */

type Group =
  | 'chest' | 'shoulders' | 'arms' | 'abs'
  | 'quads' | 'calves' | 'back' | 'glutes';

/**
 * Front-view figure in a 300x620 viewBox. Deliberately stylised rather than
 * anatomical — at video scale the silhouette has to read in half a second.
 * Groups share edges so it looks like one body, not floating parts.
 */
const SHAPES: Record<Group, string> = {
  // Deltoid caps, tucked against the torso so the arms hang off them
  shoulders: 'M108 148 q-34 2 -46 34 q10 14 30 16 q10 -32 22 -38 z '
           + 'M192 148 q34 2 46 34 q-10 14 -30 16 q-10 -32 -22 -38 z',
  chest:     'M110 152 q40 -12 80 0 q6 30 2 58 q-42 16 -84 0 q-4 -28 2 -58 z',
  // Upper arm and forearm as one tapering limb, starting under the deltoid
  arms:      'M64 186 q16 6 24 14 q-6 52 -10 104 q-14 2 -24 -4 q2 -60 10 -114 z '
           + 'M236 186 q-16 6 -24 14 q6 52 10 104 q14 2 24 -4 q-2 -60 -10 -114 z',
  abs:       'M118 212 q32 10 64 0 q-2 50 -6 96 q-26 8 -52 0 q-4 -46 -6 -96 z',
  back:      'M106 154 q44 -14 88 0 q8 32 4 62 q-48 18 -96 0 q-4 -30 4 -62 z',
  glutes:    'M114 306 q36 12 72 0 q0 26 -4 46 q-32 10 -64 0 q-4 -20 -4 -46 z',
  // Thighs, thick at the hip and tapering to the knee
  quads:     'M114 350 q30 8 32 10 q-2 62 -8 118 q-20 4 -36 -2 q2 -66 12 -126 z '
           + 'M186 350 q-30 8 -32 10 q2 62 8 118 q20 4 36 -2 q-2 -66 -12 -126 z',
  calves:    'M112 484 q18 6 32 6 q-2 44 -6 86 q-16 4 -28 -2 q2 -46 2 -90 z '
           + 'M188 484 q-18 6 -32 6 q2 44 6 86 q16 4 28 -2 q-2 -46 -2 -90 z',
};

const ORDER: Group[] = ['shoulders', 'chest', 'arms', 'abs', 'back', 'glutes', 'quads', 'calves'];

export const BodyMap: React.FC<{
  active?: Group[];
  startAt?: number;
  scale?: number;
  stagger?: number;
}> = ({ active = [], startAt = 0, scale = 1, stagger = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeSet = new Set(active);

  // Whole figure settles in first
  const settle = spring({
    frame:  frame - startAt,
    fps,
    config: { damping: 200, stiffness: 60, mass: 1.2 },
  });

  return (
    <svg
      width={300 * scale}
      height={620 * scale}
      viewBox="0 0 300 620"
      style={{
        opacity:   interpolate(settle, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(settle, [0, 1], [40, 0])}px)`,
      }}
    >
      {/* Inactive base — every group drawn dim so the silhouette always reads */}
      {ORDER.map((g) => (
        <path key={`base-${g}`} d={SHAPES[g]} fill={theme.s3} stroke={theme.b1} strokeWidth={1.5} />
      ))}

      {/* Head and neck: outline only, never a trainable group */}
      <ellipse cx={150} cy={92} rx={34} ry={42} fill={theme.s2} stroke={theme.b1} strokeWidth={1.5} />
      <rect x={138} y={130} width={24} height={22} rx={8} fill={theme.s2} stroke={theme.b1} strokeWidth={1.5} />

      {/* Active groups ignite on a stagger */}
      {ORDER.filter((g) => activeSet.has(g)).map((g, i) => {
        const local = frame - startAt - 14 - i * stagger;

        const ignite = spring({
          frame:  local,
          fps,
          config: { damping: 200, stiffness: 130, mass: 0.5 },
        });

        // Slow breathing pulse once lit, so the map feels alive rather than frozen
        const pulse = local > 0 ? 0.86 + 0.14 * Math.sin(local / 9) : 0;

        return (
          <path
            key={`lit-${g}`}
            d={SHAPES[g]}
            fill={theme.accent}
            opacity={ignite * pulse}
            style={{ filter: `drop-shadow(0 0 ${14 * ignite}px ${theme.accent})` }}
          />
        );
      })}
    </svg>
  );
};
