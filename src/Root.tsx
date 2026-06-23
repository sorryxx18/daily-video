import React from 'react';
import { Composition } from 'remotion';
import { VideoSkill, VideoSkillProps, calculateMetadata } from './VideoSkill';

const defaultProps: VideoSkillProps = {
  subtitles: [
    { startSec: 0, endSec: 4, text: '連續打嗝停不下來，醫學上唯一保證有效的物理治療是什麼？' },
    { startSec: 4, endSec: 9, text: '把手指伸進肛門，按壓 30 秒。' },
    { startSec: 9, endSec: 15, text: '這會強烈刺激迷走神經，強制重啟你的神經迴路。' },
    { startSec: 15, endSec: 20, text: '發明這招的急診科醫生，還因此拿了搞笑諾貝爾獎。' },
  ],
  audioSrc: 'tts.mp3',
  bgVideoSrcs: ['bg0.mp4', 'bg1.mp4', 'bg2.mp4', 'bg3.mp4'],
  durationInSeconds: 20,
  category: '🧠 冷知識',
};

export const Root: React.FC = () => (
  <Composition
    id="VideoSkill"
    component={VideoSkill}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={600}
    defaultProps={defaultProps}
    calculateMetadata={calculateMetadata}
  />
);
