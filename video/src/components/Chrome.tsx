import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, toneColor, Tone, BRAND } from '../theme';

/** Vignette plus a slow tonal drift, so flat black doesn't read as dead space. */
export const Backdrop: React.FC<{ tone?: Tone }> = ({ tone = 'signal' }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 120) * 6;
  const tint  = toneColor(tone);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{ background: `radial-gradient(120% 55% at 50% ${16 + drift}%, ${tint}16 0%, transparent 62%)` }}
      />
      <AbsoluteFill
        style={{ background: `linear-gradient(180deg, transparent 0%, ${theme.s1}66 100%)` }}
      />
    </AbsoluteFill>
  );
};

/** Wordmark, story kicker, and dateline — the standing newsroom furniture. */
export const Header: React.FC<{ kicker: string; date?: string; tone?: Tone }> = ({
  kicker, date, tone = 'signal',
}) => {
  const frame   = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const color   = toneColor(tone);

  return (
    <div style={{ position: 'absolute', top: 86, left: 66, right: 66, opacity }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            fontFamily: theme.font, fontSize: 32, fontWeight: 900,
            letterSpacing: '-0.02em', color: theme.t1,
          }}
        >
          {BRAND.name}
        </span>
        <span
          style={{
            fontFamily: theme.font, fontSize: 32, fontWeight: 900,
            letterSpacing: '-0.02em', color,
          }}
        >
          {BRAND.name2}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <span style={{ width: 26, height: 3, backgroundColor: color, borderRadius: 2 }} />
        <span
          style={{
            fontFamily: theme.mono, fontSize: 20, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: theme.t2,
          }}
        >
          {kicker}
        </span>
        {date ? (
          <span
            style={{
              fontFamily: theme.mono, fontSize: 20, letterSpacing: '0.1em',
              color: theme.t3, marginLeft: 'auto',
            }}
          >
            {date}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** Position within the video. */
export const ProgressRail: React.FC<{ tone?: Tone }> = ({ tone = 'signal' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const color = toneColor(tone);
  const pct   = Math.min(frame / Math.max(durationInFrames - 1, 1), 1);

  return (
    <div style={{ position: 'absolute', bottom: 126, left: 66, right: 66 }}>
      <div style={{ height: 3, borderRadius: 2, backgroundColor: theme.s3 }}>
        <div
          style={{
            height: '100%', width: `${pct * 100}%`, borderRadius: 2,
            backgroundColor: color, boxShadow: `0 0 14px ${color}99`,
          }}
        />
      </div>
    </div>
  );
};

/** Source attribution — the thing that makes a news channel credible. */
export const SourceTag: React.FC<{ source?: string }> = ({ source }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [6, 20], [0, 1], { extrapolateRight: 'clamp' });
  if (!source) return null;

  return (
    <div
      style={{
        position: 'absolute', bottom: 62, left: 66,
        fontFamily: theme.mono, fontSize: 21, color: theme.t3,
        letterSpacing: '0.06em', opacity,
      }}
    >
      SOURCE: {source}
    </div>
  );
};
