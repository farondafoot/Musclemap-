import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { theme, Tone } from './theme';
import { BrandOpen } from './scenes/BrandOpen';
import { HeroStat } from './scenes/HeroStat';
import { LineCard } from './scenes/LineCard';
import { Outro } from './scenes/Outro';
import content from './content.json';

/**
 * Assembles the shot table from content.json, following the energy arc:
 *   cold open (low) -> hero stat (slow, highest texture)
 *   -> story lines (alternating) -> sign-off (peak)
 *
 * Python writes content.json and measures the narration, so shot budgets come
 * from real audio length rather than guesses.
 */

type Content = {
  kicker:    string;
  date?:     string;
  tone?:     Tone;
  source?:   string;
  headline?: string;
  stat?:     { value: string; caption: string };
  lines:     string[];
  audio?:    string | null;
  audioFrom?: number;
  fps:       number;
  brandOpen: number;
  hero:      number;
  outro:     number;
  perLine:   number[];
  cta?:      string;
};

const c = content as Content;

const VARIANTS = ['rule', 'plain', 'quote', 'stat', 'plain', 'rule'] as const;

const buildShots = () => {
  const shots: { from: number; duration: number; kind: string; payload?: unknown }[] = [];
  let cursor = 0;

  shots.push({ from: cursor, duration: c.brandOpen, kind: 'brand' });
  cursor += c.brandOpen;

  if (c.stat && c.hero > 0) {
    shots.push({ from: cursor, duration: c.hero, kind: 'hero' });
    cursor += c.hero;
  }

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

/**
 * Short fade up at the head of each shot. Replaces an earlier white flash,
 * which read as a strobe rather than a beat — the scene animations already
 * carry the cut, so the transition only needs to not be abrupt.
 */
const ShotIn: React.FC<React.PropsWithChildren> = ({ children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const DailyMain: React.FC = () => {
  const tone      = c.tone ?? 'signal';
  const lineCount = shots.filter((s) => s.kind === 'line').length;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {/* Narration covers the line shots, so it starts after the cold open and
          hero stat — each line's shot is sized to its own clip, keeping voice
          and visuals locked together. */}
      {c.audio ? (
        <Sequence from={c.audioFrom ?? 0}>
          <Audio src={staticFile(c.audio)} />
        </Sequence>
      ) : null}

      {shots.map((shot, idx) => {
        const key = `${shot.kind}-${idx}`;

        if (shot.kind === 'brand') {
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <BrandOpen kicker={c.kicker} date={c.date} tone={tone} />
            </Sequence>
          );
        }

        if (shot.kind === 'hero' && c.stat) {
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <ShotIn>
                <HeroStat
                  kicker={c.kicker}
                  date={c.date}
                  value={c.stat.value}
                  caption={c.stat.caption}
                  line={c.headline}
                  tone={tone}
                  source={c.source}
                />
              </ShotIn>
            </Sequence>
          );
        }

        if (shot.kind === 'line') {
          const { line, i } = shot.payload as { line: string; i: number };
          return (
            <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
              <ShotIn>
                <LineCard
                  kicker={c.kicker}
                  date={c.date}
                  line={line}
                  index={i}
                  total={lineCount}
                  tone={tone}
                  source={c.source}
                  variant={VARIANTS[i % VARIANTS.length]}
                />
              </ShotIn>
            </Sequence>
          );
        }

        return (
          <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
            <ShotIn>
              <Outro cta={c.cta} tone={tone} />
            </ShotIn>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
