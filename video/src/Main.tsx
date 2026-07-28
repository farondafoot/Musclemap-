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

/** Quick flash on hard cuts, so a change of shot reads as a beat. */
const FlashCut: React.FC<{ tone?: Tone }> = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 2, 6], [0, 0.14, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity, pointerEvents: 'none' }} />;
};

export const DailyMain: React.FC = () => {
  const tone      = c.tone ?? 'signal';
  const lineCount = shots.filter((s) => s.kind === 'line').length;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {c.audio ? <Audio src={staticFile(c.audio)} /> : null}

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
              <HeroStat
                kicker={c.kicker}
                date={c.date}
                value={c.stat.value}
                caption={c.stat.caption}
                line={c.headline}
                tone={tone}
                source={c.source}
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
                kicker={c.kicker}
                date={c.date}
                line={line}
                index={i}
                total={lineCount}
                tone={tone}
                source={c.source}
                variant={VARIANTS[i % VARIANTS.length]}
              />
              <FlashCut />
            </Sequence>
          );
        }

        return (
          <Sequence key={key} from={shot.from} durationInFrames={shot.duration}>
            <Outro cta={c.cta} tone={tone} />
            <FlashCut />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
