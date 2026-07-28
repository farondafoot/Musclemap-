import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, toneColor, Tone } from '../theme';
import { Backdrop, Header, ProgressRail, SourceTag } from '../components/Chrome';
import { KineticText } from '../components/KineticText';
import { NodeGraph } from '../components/NodeGraph';

/**
 * The workhorse shot: one line of the story as kinetic type.
 *
 * The node graph builds across the video (more of it lives with each line), so
 * the frame is never mostly empty and there's visible forward motion. `variant`
 * alternates the lower treatment so consecutive lines don't read as one card
 * with the words swapped.
 */
export const LineCard: React.FC<{
  kicker: string;
  date?: string;
  line: string;
  index: number;
  total: number;
  tone?: Tone;
  source?: string;
  variant?: 'plain' | 'rule' | 'quote' | 'stat';
}> = ({ kicker, date, line, index, total, tone = 'signal', source, variant = 'plain' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const color = toneColor(tone);

  const drift    = interpolate(frame, [0, durationInFrames], [0, -18]);
  const accentIn = spring({ frame, fps, config: { damping: 200, stiffness: 80, mass: 0.9 } });
  const statIn   = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 90, mass: 0.8 } });

  // Graph fills in as the story advances
  const intensity = 0.35 + 0.65 * ((index + 1) / total);

  // 'stat' features the first number in the line; without one it has nothing
  // to show, so it degrades to a rule.
  const numMatch  = line.match(/\b(\d[\d,.]*%?)\b/);
  const effective = variant === 'stat' && !numMatch ? 'rule' : variant;

  return (
    <AbsoluteFill>
      <Backdrop tone={tone} />
      <Header kicker={kicker} date={date} tone={tone} />

      <div
        style={{
          position: 'absolute', top: 268, left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          opacity: 0.4, transform: `translateY(${drift * 0.5}px)`,
        }}
      >
        <NodeGraph intensity={intensity} tone={tone} startAt={0} scale={0.82} />
      </div>

      <div
        style={{
          position: 'absolute', left: 66, right: 66, bottom: 244,
          transform: `translateY(${drift}px)`,
        }}
      >
        {effective === 'rule' ? (
          <div
            style={{
              width: `${interpolate(accentIn, [0, 1], [0, 148])}px`,
              height: 6, borderRadius: 3, backgroundColor: color,
              marginBottom: 32, boxShadow: `0 0 20px ${color}aa`,
            }}
          />
        ) : null}

        {effective === 'quote' ? (
          <div
            style={{
              fontFamily: theme.font, fontSize: 136, fontWeight: 900,
              color, opacity: accentIn * 0.3, lineHeight: 0.55, marginBottom: 14,
            }}
          >
            “
          </div>
        ) : null}

        {effective === 'stat' && numMatch ? (
          <div
            style={{
              fontFamily: theme.mono, fontSize: 142, fontWeight: 700,
              color, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 18,
              opacity: statIn,
              transform: `translateY(${interpolate(statIn, [0, 1], [34, 0])}px)`,
              textShadow: `0 0 46px ${color}55`,
            }}
          >
            {numMatch[1]}
          </div>
        ) : null}

        <KineticText
          text={line}
          size={82}
          startAt={effective === 'stat' ? 14 : 4}
          stagger={2.2}
          accentColor={color}
          maxWidth={948}
        />
      </div>

      <ProgressRail tone={tone} />
      <div
        style={{
          position: 'absolute', bottom: 152, right: 66,
          fontFamily: theme.mono, fontSize: 20, color: theme.t3,
          letterSpacing: '0.1em',
        }}
      >
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>

      <SourceTag source={source} />
    </AbsoluteFill>
  );
};
