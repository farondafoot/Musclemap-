import React from 'react';
import { Composition } from 'remotion';
import { DailyMain, TOTAL_FRAMES } from './Main';
import { VIDEO } from './theme';

export const Root: React.FC = () => {
  return (
    <Composition
      id="DailyShort"
      component={DailyMain}
      durationInFrames={TOTAL_FRAMES}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
  );
};
