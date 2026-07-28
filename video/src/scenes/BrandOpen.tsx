import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, glow, toneColor, Tone, BRAND } from '../theme';
import { Backdrop } from '../components/Chrome';
import { NodeGraph } from '../components/NodeGraph';

/**
 * Cold open. Wordmark stamps in and holds fully on for a beat before handing
 * off — cutting the instant it lands reads as a glitch.
 */
export const BrandOpen: React.FC<{
  kicker?: string;
  date?: string;
  tone?: Tone;
}> = ({ kicker, date, tone = 'signal' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const color = toneColor(tone);

  const stamp   = spring({ frame, fps, config: { damping: 200, stiffness: 90, mass: 0.9 } });
  const scale   = interpolate(stamp, [0, 1], [1.28, 1]);
  const blur    = interpolate(stamp, [0, 1], [12, 0]);
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  const rule    = spring({ frame: frame - 14, fps, config: { damping: 200, stiffness: 70, mass: 1 } });
  const kickIn  = spring({ frame: frame - 28, fps, config: { damping: 200, stiffness: 100, mass: 0.7 } });

  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <Backdrop tone={tone} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 0.18 }}>
        <NodeGraph intensity={0.55} tone={tone} startAt={4} scale={1.5} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: 'center', alignItems: 'center',
          transform: `translateY(${exit * -50}px)`, opacity: 1 - exit * 0.35,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`, opacity, textAlign: 'center',
            filter: blur > 0.4 ? `blur(${blur}px)` : 'none',
          }}
        >
          <div
            style={{
              fontFamily: theme.font, fontSize: 96, fontWeight: 900,
              letterSpacing: '-0.045em', color: theme.t1, lineHeight: 1.02,
            }}
          >
            {BRAND.name}
          </div>
          <div
            style={{
              fontFamily: theme.font, fontSize: 96, fontWeight: 900,
              letterSpacing: '-0.045em', color, lineHeight: 1.02,
              textShadow: glow(color, 0.9),
            }}
          >
            {BRAND.name2}
          </div>

          <div
            style={{
              height: 5, marginTop: 26, marginLeft: 'auto', marginRight: 'auto',
              width: `${interpolate(rule, [0, 1], [0, 58])}%`,
              backgroundColor: color, borderRadius: 3,
              boxShadow: `0 0 20px ${color}aa`,
            }}
          />
        </div>

        <div
          style={{
            marginTop: 44, textAlign: 'center',
            opacity: kickIn,
            transform: `translateY(${interpolate(kickIn, [0, 1], [18, 0])}px)`,
          }}
        >
          {date ? (
            <div
              style={{
                fontFamily: theme.mono, fontSize: 24, letterSpacing: '0.2em',
                color: theme.t3, marginBottom: 10,
              }}
            >
              {date}
            </div>
          ) : null}
          {kicker ? (
            <div
              style={{
                fontFamily: theme.mono, fontSize: 26, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: theme.t2,
              }}
            >
              {kicker}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
