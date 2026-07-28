import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { Backdrop, Header, Footer } from '../components/Chrome';
import { BodyMap } from '../components/BodyMap';
import { KineticText } from '../components/KineticText';

/**
 * Hero shot: the body map is the product's atomic unit, so it gets one slow,
 * complete arc rather than being cut into the feature montage.
 */
export const HeroMap: React.FC<{
  label: string;
  line: string;
  active?: string[];
}> = ({ label, line, active = ['chest', 'shoulders', 'arms'] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slow push-in across the whole shot
  const push = interpolate(frame, [0, 120], [1, 1.08], { extrapolateRight: 'clamp' });

  const cardIn = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 70, mass: 1.1 },
  });

  return (
    <AbsoluteFill>
      <Backdrop />
      <Header label={label} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            transform: `scale(${push})`,
            marginTop: -80,
            padding:   '52px 64px',
            borderRadius: 28,
            backgroundColor: `${theme.s1}cc`,
            border:    `1px solid ${theme.b1}`,
            boxShadow: `0 30px 90px #00000088`,
            opacity:   cardIn,
          }}
        >
          <BodyMap active={active as never[]} startAt={6} scale={0.92} />
        </div>
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 68, right: 68, bottom: 230 }}>
        <KineticText text={line} size={58} startAt={26} stagger={2} maxWidth={944} />
      </div>

      <Footer />
    </AbsoluteFill>
  );
};
