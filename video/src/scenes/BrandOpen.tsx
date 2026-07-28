import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, glow } from '../theme';
import { Backdrop } from '../components/Chrome';

/**
 * Brand open. Wordmark stamps in, holds fully on for a beat, then hands off.
 * The hold is deliberate: cutting the moment the logo lands reads as a glitch.
 */
export const BrandOpen: React.FC<{ hook?: string }> = ({ hook }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const stamp = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 90, mass: 0.9 },
  });

  const scale   = interpolate(stamp, [0, 1], [1.35, 1]);
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const blur    = interpolate(stamp, [0, 1], [14, 0]);

  // Underline sweeps out from under the wordmark once it has landed
  const rule = spring({
    frame:  frame - 16,
    fps,
    config: { damping: 200, stiffness: 70, mass: 1 },
  });

  // Hand-off: whole lockup lifts and dims on the way out
  const exitStart = durationInFrames - 14;
  const exit = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const hookIn = spring({
    frame:  frame - 30,
    fps,
    config: { damping: 200, stiffness: 100, mass: 0.7 },
  });

  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems:     'center',
          transform:      `translateY(${exit * -60}px)`,
          opacity:        1 - exit * 0.4,
        }}
      >
        <div
          style={{
            transform:  `scale(${scale})`,
            opacity,
            filter:     blur > 0.4 ? `blur(${blur}px)` : 'none',
            textAlign:  'center',
          }}
        >
          <div
            style={{
              fontFamily:    theme.font,
              fontSize:      124,
              fontWeight:    900,
              letterSpacing: '-0.045em',
              color:         theme.t1,
              textShadow:    glow(theme.accent, 0.8),
            }}
          >
            Muscle<span style={{ color: theme.accent }}>Map</span>
          </div>

          <div
            style={{
              height:          5,
              marginTop:       22,
              marginLeft:      'auto',
              marginRight:     'auto',
              width:           `${interpolate(rule, [0, 1], [0, 62])}%`,
              backgroundColor: theme.accent,
              borderRadius:    3,
              boxShadow:       `0 0 20px ${theme.accent}aa`,
            }}
          />
        </div>

        {hook ? (
          <div
            style={{
              marginTop:     40,
              fontFamily:    theme.mono,
              fontSize:      26,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color:         theme.t2,
              opacity:       hookIn,
              transform:     `translateY(${interpolate(hookIn, [0, 1], [18, 0])}px)`,
            }}
          >
            {hook}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
