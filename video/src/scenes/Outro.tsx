import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, glow } from '../theme';
import { Backdrop } from '../components/Chrome';
import { BodyMap } from '../components/BodyMap';

/**
 * Peak-energy sign-off. Elements from the body of the video converge around the
 * wordmark, which then holds fully on for a beat before the cut.
 */
export const Outro: React.FC<{ cta?: string }> = ({
  cta = 'Track every rep.',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const converge = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 60, mass: 1.3 },
  });

  const wordmark = spring({
    frame:  frame - 18,
    fps,
    config: { damping: 200, stiffness: 95, mass: 0.8 },
  });

  const urlIn = spring({
    frame:  frame - 34,
    fps,
    config: { damping: 200, stiffness: 100, mass: 0.7 },
  });

  // Everything lights up for the finale
  const allGroups = ['shoulders', 'chest', 'arms', 'abs', 'back', 'glutes', 'quads', 'calves'];

  // Hold the final frame fully on — no fade on the last beat
  const holdStart = durationInFrames - 30;
  const settle = interpolate(frame, [holdStart, durationInFrames], [1, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* Body map recedes behind the lockup, fully lit */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems:     'center',
          // Kept faint: the figure is texture behind the lockup, and any
          // brighter it competes with the sign-off text for legibility.
          opacity:        interpolate(converge, [0, 1], [0, 0.13]),
          transform:      `scale(${interpolate(converge, [0, 1], [1.5, 1.15])})`,
          filter:         'blur(2px)',
        }}
      >
        <BodyMap active={allGroups as never[]} startAt={0} scale={1.5} stagger={2} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            fontFamily:    theme.font,
            fontSize:      52,
            fontWeight:    600,
            color:         theme.t2,
            opacity:       interpolate(wordmark, [0, 1], [0, 1]),
            transform:     `translateY(${interpolate(wordmark, [0, 1], [26, 0])}px)`,
            marginBottom:  26,
            letterSpacing: '-0.01em',
          }}
        >
          {cta}
        </div>

        <div
          style={{
            fontFamily:    theme.font,
            fontSize:      132,
            fontWeight:    900,
            letterSpacing: '-0.045em',
            color:         theme.t1,
            textShadow:    glow(theme.accent, 1.2 * settle),
            opacity:       wordmark,
            transform:     `scale(${interpolate(wordmark, [0, 1], [0.86, 1])})`,
          }}
        >
          Muscle<span style={{ color: theme.accent }}>Map</span>
        </div>

        <div
          style={{
            marginTop:       34,
            padding:         '18px 40px',
            borderRadius:    999,
            border:          `2px solid ${theme.accent}`,
            backgroundColor: `${theme.accent}18`,
            fontFamily:      theme.font,
            fontSize:        30,
            fontWeight:      600,
            color:           theme.accent3,
            opacity:         urlIn,
            transform:       `translateY(${interpolate(urlIn, [0, 1], [22, 0])}px)`,
            boxShadow:       `0 0 40px ${theme.accent}33`,
          }}
        >
          Free in your browser
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
