import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

/**
 * Word-by-word reveal. Each word springs up and fades in on a stagger, which is
 * what separates this from a static card fading in as one block.
 *
 * Words containing digits or a % are accented automatically, so numbers pop
 * without the caller marking them up.
 */
export const KineticText: React.FC<{
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  accentColor?: string;
  stagger?: number;
  startAt?: number;
  lineHeight?: number;
  align?: 'left' | 'center';
  maxWidth?: number;
  uppercase?: boolean;
}> = ({
  text,
  size = 76,
  weight = 800,
  color = theme.t1,
  accentColor = theme.accent,
  stagger = 2.5,
  startAt = 0,
  lineHeight = 1.18,
  align = 'left',
  maxWidth = 900,
  uppercase = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <div
      style={{
        display:        'flex',
        flexWrap:       'wrap',
        gap:            `${size * 0.22}px ${size * 0.28}px`,
        maxWidth,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        textAlign:      align,
      }}
    >
      {words.map((word, i) => {
        const local = frame - startAt - i * stagger;

        const enter = spring({
          frame: local,
          fps,
          config: { damping: 200, stiffness: 110, mass: 0.6 },
        });

        const opacity = interpolate(local, [0, 6], [0, 1], {
          extrapolateLeft:  'clamp',
          extrapolateRight: 'clamp',
        });

        const y    = interpolate(enter, [0, 1], [size * 0.55, 0]);
        const blur = interpolate(enter, [0, 1], [8, 0]);

        const isNumeric = /[\d%]/.test(word);

        return (
          <span
            key={i}
            style={{
              display:       'inline-block',
              fontFamily:    theme.font,
              fontSize:      size,
              fontWeight:    weight,
              lineHeight,
              letterSpacing: '-0.02em',
              color:         isNumeric ? accentColor : color,
              textTransform: uppercase ? 'uppercase' : 'none',
              opacity,
              filter:        blur > 0.4 ? `blur(${blur}px)` : 'none',
              transform:     `translateY(${y}px)`,
              willChange:    'transform, opacity',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
