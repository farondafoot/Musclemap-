import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { BrandOpen } from './scenes/BrandOpen';
import { HeroMap } from './scenes/HeroMap';
import { LineCard } from './scenes/LineCard';
import { Outro } from './scenes/Outro';
import content from './content.json';

/**
 * Builds the shot table from content.json, following the energy arc the
 * shot library recommends for a 30-60s promo:
 *
 *   brand open (low)  ->  hero (slowest, highest texture)
 *   ->  line montage (alternating energy)  ->  outro (peak)
 *
 * The Python side writes content.json and measures the narration audio, so the
 * shot budget is derived from real audio length rather than guessed.
 */

type Content = {
  label:     string;
  hook?:     string;
  lines:     string[];
  audio?:    string | null;
  fps:       number;
  brandOpen: number;
  hero:      number;
  outro:     number;
  perLine:   number[];
  activeMuscles?: string[];
};

const c = content as Content;

const VARIANTS = ['rule', 'plain', 'quote', 'plain', 'stat', 'plain'] as const;

export const buildShots = () => {
  const shots: { from: number; duration: number; kind: string; payload?: unknown }[] = [];
  let cursor = 0;

  shots.push({ from: 0, duration: c.brandOpen, kind: 'brand' });
  cursor += c.brandOpen;

  shots.push({ from: cursor, duration: c.hero, kind: 'hero' });
  cursor += c.hero;

  c.lines.forEach((line, i) => {
    const dur = c.perLine[i] ?? 60;
    shots.push({ from: cursor, duration: dur, kind: 'line', payload: { line, i } });
    cursor += dur;
  });

  shots.push({ from: cursor, duration: c.outro, kind: 'outro' });
  cursor += c.outro;

  return { shots, total: cursor };
};

const { shots, total } = buildShots();
export const TOTAL_FRAMES = total;

/** Quick white flash on hard cuts — reads as a beat rather than a jump. */
const FlashCut: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 2, 6], [0, 0.16, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity, pointerEvents: 'none' }} />;
};

export const MuscleMapMain: React.FC = () => {
  const lineShots = shots.filter((s) => s.kind === 'line');

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {c.audio ? <Audio src={staticFile(c.audio)} /> : null}

      {shots.map((shot, idx) => {
        const key = `${shot.kind}-${idx}`;

        if (shot.kind === 'brand') {
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <BrandOpen hook={c.hook} />
            </Sequence>
          );
        }

        if (shot.kind === 'hero') {
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <HeroMap
                label={c.label}
                line={c.lines[0] ?? ''}
                active={c.activeMuscles ?? ['chest', 'shoulders', 'arms']}
              />
              <FlashCut />
            </Sequence>
          );
        }

        if (shot.kind === 'line') {
          const { line, i } = shot.payload as { line: string; i: number };
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <LineCard
                label={c.label}
                line={line}
                index={i}
                total={lineShots.length}
                variant={VARIANTS[i % VARIANTS.length]}
              />
              <FlashCut />
            </Sequence>
          );
        }

        return (
          <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
            <Outro />
            <FlashCut />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
