import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

/** Vignette + subtle vertical gradient, so flat black doesn't read as dead space. */
export const Backdrop: React.FC<{ tint?: string }> = ({ tint = theme.accent }) => {
  const frame = useCurrentFrame();
  // Very slow drift keeps the background from looking like a still image
  const drift = Math.sin(frame / 120) * 6;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 60% at 50% ${18 + drift}%, ${tint}14 0%, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${theme.s1}00 0%, ${theme.s1}55 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Persistent header lockup: wordmark plus the content-type label. */
export const Header: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', top: 92, left: 68, opacity }}>
      <div
        style={{
          fontFamily:    theme.font,
          fontSize:      40,
          fontWeight:    900,
          letterSpacing: '-0.03em',
          color:         theme.accent,
        }}
      >
        MuscleMap
      </div>
      <div
        style={{
          fontFamily:    theme.mono,
          fontSize:      21,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color:         theme.t3,
          marginTop:     8,
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** Progress rail across the bottom, showing position within the whole video. */
export const ProgressRail: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const pct = Math.min(frame / Math.max(total - 1, 1), 1);

  return (
    <div style={{ position: 'absolute', bottom: 128, left: 68, right: 68 }}>
      <div style={{ height: 4, borderRadius: 2, backgroundColor: theme.s3 }}>
        <div
          style={{
            height:          '100%',
            width:           `${pct * 100}%`,
            borderRadius:    2,
            backgroundColor: theme.accent,
            boxShadow:       `0 0 16px ${theme.accent}88`,
          }}
        />
      </div>
    </div>
  );
};

/** Sign-off strip pinned to the bottom of every scene. */
export const Footer: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, 14, durationInFrames - 10, durationInFrames],
    [0, 1, 1, 0.85],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position:   'absolute',
        bottom:     64,
        left:       68,
        fontFamily: theme.font,
        fontSize:   26,
        fontWeight: 500,
        color:      theme.t2,
        opacity,
      }}
    >
      Track every rep · free in your browser
    </div>
  );
};
