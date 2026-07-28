import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { Backdrop, Header, Footer, ProgressRail } from '../components/Chrome';
import { KineticText } from '../components/KineticText';
import { BodyMap } from '../components/BodyMap';

const ALL_GROUPS = ['shoulders', 'chest', 'arms', 'abs', 'back', 'glutes', 'quads', 'calves'];

/**
 * The workhorse shot: one narration line as kinetic type.
 *
 * A dimmed body map occupies the upper half and gains one more lit group per
 * line, so the frame is never mostly empty and the viewer sees the map filling
 * in across the video. `variant` alternates the lower treatment so consecutive
 * lines don't read as the same card with new words.
 */
export const LineCard: React.FC<{
  label: string;
  line: string;
  index: number;
  total: number;
  variant?: 'plain' | 'rule' | 'quote' | 'stat';
}> = ({ label, line, index, total, variant = 'plain' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const drift = interpolate(frame, [0, durationInFrames], [0, -20]);

  const accentIn = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 80, mass: 0.9 },
  });

  // Map fills in as the video advances: line 1 lights 2 groups, the last lights all.
  const litCount = Math.max(2, Math.round(((index + 1) / total) * ALL_GROUPS.length));
  const lit      = ALL_GROUPS.slice(0, litCount);

  // 'stat' pulls the first number out of the line and shows it large. If the
  // line has no number there's nothing to feature, so it falls back to a rule.
  const numMatch  = line.match(/\b(\d+(?:[.,]\d+)?%?)\b/);
  const effective = variant === 'stat' && !numMatch ? 'rule' : variant;

  const statSpring = spring({
    frame:  frame - 6,
    fps,
    config: { damping: 200, stiffness: 90, mass: 0.8 },
  });

  return (
    <AbsoluteFill>
      <Backdrop tint={effective === 'stat' ? theme.success : theme.accent} />
      <Header label={label} />

      {/* Body map anchored in the upper half, dim so type stays dominant */}
      <div
        style={{
          position:  'absolute',
          top:       250,
          left:      0,
          right:     0,
          display:   'flex',
          justifyContent: 'center',
          opacity:   0.5,
          transform: `translateY(${drift * 0.5}px)`,
        }}
      >
        <BodyMap active={lit as never[]} startAt={0} scale={0.85} stagger={3} />
      </div>

      {/* Copy block anchored to the lower third */}
      <div
        style={{
          position:     'absolute',
          left:         68,
          right:        68,
          bottom:       250,
          transform:    `translateY(${drift}px)`,
        }}
      >
        {effective === 'rule' ? (
          <div
            style={{
              width:           `${interpolate(accentIn, [0, 1], [0, 150])}px`,
              height:          6,
              borderRadius:    3,
              backgroundColor: theme.accent,
              marginBottom:    34,
              boxShadow:       `0 0 22px ${theme.accent}aa`,
            }}
          />
        ) : null}

        {effective === 'quote' ? (
          <div
            style={{
              fontFamily:   theme.font,
              fontSize:     140,
              fontWeight:   900,
              color:        theme.accent,
              opacity:      accentIn * 0.3,
              lineHeight:   0.55,
              marginBottom: 16,
            }}
          >
            “
          </div>
        ) : null}

        {effective === 'stat' && numMatch ? (
          <div
            style={{
              fontFamily:    theme.mono,
              fontSize:      150,
              fontWeight:    700,
              color:         theme.success,
              letterSpacing: '-0.04em',
              lineHeight:    1,
              marginBottom:  20,
              opacity:       statSpring,
              transform:     `translateY(${interpolate(statSpring, [0, 1], [36, 0])}px)`,
              textShadow:    `0 0 50px ${theme.success}55`,
            }}
          >
            {numMatch[1]}
          </div>
        ) : null}

        <KineticText
          text={line}
          size={84}
          startAt={effective === 'stat' ? 14 : 4}
          stagger={2.2}
          maxWidth={944}
        />
      </div>

      <ProgressRail total={total} />
      <div
        style={{
          position:      'absolute',
          bottom:        156,
          right:         68,
          fontFamily:    theme.mono,
          fontSize:      20,
          color:         theme.t3,
          letterSpacing: '0.1em',
        }}
      >
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>

      <Footer />
    </AbsoluteFill>
  );
};
