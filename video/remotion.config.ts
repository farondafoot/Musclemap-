import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');

// Concurrency 1 on purpose. Higher values have produced single-frame slice
// artifacts that don't show up in the studio preview, only in the export.
// Rendering is slower but the output is trustworthy.
Config.setConcurrency(1);
