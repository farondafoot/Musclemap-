import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, toneColor, Tone, glow } from '../theme';
import { Backdrop, Header, SourceTag } from '../components/Chrome';
import { NodeGraph } from '../components/NodeGraph';
import { KineticText } from '../components/KineticText';

/**
 * The hero shot: one number that carries the story, counted up.
 *
 * News lives or dies on a concrete figure — 17,000 actions, $250 billion, nine
 * days. This gives that figure a slow, complete arc instead of burying it in
 * the montage.
 */
export const HeroStat: React.FC<{
  kicker: string;
  date?: string;
  value: string;
  caption: string;
  line?: string;
  tone?: Tone;
  source?: string;
}> = ({ kicker, date, value, caption, line, tone = 'signal', source }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = toneColor(tone);

  const rise = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 70, mass: 1 } });

  // Split "$250B" or "17,000" into prefix / number / suffix in one pass. Doing
  // this with indexOf breaks on grouped numbers, because the digits-only string
  // never appears in the original.
  const parts   = value.match(/^([^\d]*)([\d][\d,]*(?:\.\d+)?)(.*)$/);
  const prefix  = parts?.[1] ?? '';
  const rawNum  = parts?.[2] ?? '';
  const suffix  = parts?.[3] ?? '';

  const shown = rawNum
    ? (() => {
        const target = parseFloat(rawNum.replace(/,/g, ''));
        const t = interpolate(frame, [8, 46], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const eased  = 1 - Math.pow(1 - t, 3);   // ease-out: fast then settling
        const now    = target * eased;
        return rawNum.includes('.')
          ? now.toFixed(1)
          : Math.round(now).toLocaleString('en-US');
      })()
    : value;

  // Long figures have to shrink or they run past the frame edge
  const shownLength = (prefix + shown + suffix).length;
  const statSize    = shownLength <= 4 ? 200
                    : shownLength <= 6 ? 168
                    : shownLength <= 8 ? 140
                    : 116;

  return (
    <AbsoluteFill>
      <Backdrop tone={tone} />
      <Header kicker={kicker} date={date} tone={tone} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 0.22 }}>
        <NodeGraph intensity={0.85} tone={tone} startAt={0} scale={1.35} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', marginTop: -40 }}>
        <div
          style={{
            fontFamily: theme.mono, fontSize: statSize, fontWeight: 700,
            letterSpacing: '-0.05em', color, lineHeight: 1,
            textShadow: glow(color, 1.1),
            opacity: rise,
            transform: `translateY(${interpolate(rise, [0, 1], [46, 0])}px)`,
          }}
        >
          {prefix}{shown}{suffix}
        </div>

        <div
          style={{
            marginTop: 20, fontFamily: theme.mono, fontSize: 26,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: theme.t2, opacity: rise, textAlign: 'center',
            maxWidth: 860,
          }}
        >
          {caption}
        </div>
      </AbsoluteFill>

      {line ? (
        <div style={{ position: 'absolute', left: 66, right: 66, bottom: 236 }}>
          <KineticText text={line} size={56} startAt={40} stagger={2} maxWidth={948} />
        </div>
      ) : null}

      <SourceTag source={source} />
    </AbsoluteFill>
  );
};
