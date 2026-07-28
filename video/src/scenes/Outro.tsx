import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, glow, toneColor, Tone, BRAND } from '../theme';
import { Backdrop } from '../components/Chrome';
import { NodeGraph } from '../components/NodeGraph';

/**
 * Sign-off at peak energy: the graph goes fully live behind the wordmark, then
 * the lockup holds fully on for a beat before the cut.
 */
export const Outro: React.FC<{ cta?: string; tone?: Tone }> = ({
  cta = 'Follow for the daily AI briefing',
  tone = 'signal',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = toneColor(tone);

  const converge = spring({ frame, fps, config: { damping: 200, stiffness: 60, mass: 1.3 } });
  const mark     = spring({ frame: frame - 16, fps, config: { damping: 200, stiffness: 95, mass: 0.8 } });
  const ctaIn    = spring({ frame: frame - 32, fps, config: { damping: 200, stiffness: 100, mass: 0.7 } });

  return (
    <AbsoluteFill>
      <Backdrop tone={tone} />

      {/* Graph fully alive, kept faint and soft so the lockup stays legible */}
      <AbsoluteFill
        style={{
          justifyContent: 'center', alignItems: 'center',
          opacity:   interpolate(converge, [0, 1], [0, 0.16]),
          transform: `scale(${interpolate(converge, [0, 1], [1.5, 1.2])})`,
          filter:    'blur(1.5px)',
        }}
      >
        <NodeGraph intensity={1} tone={tone} startAt={0} scale={1.7} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            textAlign: 'center',
            opacity:   mark,
            transform: `scale(${interpolate(mark, [0, 1], [0.88, 1])})`,
          }}
        >
          <div
            style={{
              fontFamily: theme.font, fontSize: 104, fontWeight: 900,
              letterSpacing: '-0.045em', color: theme.t1, lineHeight: 1.02,
            }}
          >
            {BRAND.name}
          </div>
          <div
            style={{
              fontFamily: theme.font, fontSize: 104, fontWeight: 900,
              letterSpacing: '-0.045em', color, lineHeight: 1.02,
              textShadow: glow(color, 1.2),
            }}
          >
            {BRAND.name2}
          </div>
        </div>

        <div
          style={{
            marginTop: 40, padding: '18px 42px', borderRadius: 999,
            border: `2px solid ${color}`, backgroundColor: `${color}18`,
            fontFamily: theme.font, fontSize: 30, fontWeight: 600,
            color: theme.t1, opacity: ctaIn,
            transform: `translateY(${interpolate(ctaIn, [0, 1], [22, 0])}px)`,
            boxShadow: `0 0 40px ${color}33`,
          }}
        >
          {cta}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
