import React from 'react';
import { Composition } from 'remotion';
import { MuscleMapMain, TOTAL_FRAMES } from './Main';
import { VIDEO } from './theme';

export const Root: React.FC = () => {
  return (
    <Composition
      id="MuscleMapShort"
      component={MuscleMapMain}
      durationInFrames={TOTAL_FRAMES}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
  );
};
