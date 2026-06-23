import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Video,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
  CalculateMetadataFunction,
} from 'remotion';

interface SubtitleEntry {
  startSec: number;
  endSec: number;
  text: string;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  durationMs: number;
}

export interface VideoSkillProps extends Record<string, unknown> {
  subtitles: SubtitleEntry[];
  audioSrc: string;
  bgVideoSrcs: string[];   // 每句字幕對應一支背景影片
  durationInSeconds: number;
  category: string;
  wordTimestamps?: WordTimestamp[][];
  bgMusicSrc?: string;     // 可選背景音樂
  bgMusicVolume?: number;  // 預設 0.15
}

// ── 進度條 ───────────────────────────────────────────────────────────────────

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = (frame / durationInFrames) * 100;

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', pointerEvents: 'none' }}>
      <div
        style={{
          height: 5,
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #FFD700, #FF6B35)',
          borderRadius: '0 3px 3px 0',
          boxShadow: '0 0 8px rgba(255,107,53,0.7)',
        }}
      />
    </AbsoluteFill>
  );
};

// ── 類別標籤 ─────────────────────────────────────────────────────────────────

const CategoryTag: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const ty = interpolate(frame, [0, 18], [24, 0], { extrapolateRight: 'clamp' });
  const op = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: '28px 36px 0' }}>
      <div
        style={{
          transform: `translateY(${ty}px)`,
          opacity: op,
          backgroundColor: 'rgba(255, 215, 0, 0.92)',
          borderRadius: 24,
          padding: '8px 20px',
        }}
      >
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#1a1a1a',
            fontFamily: 'Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif',
            letterSpacing: 1,
          }}
        >
          {label}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ── 底部漸層遮罩 ──────────────────────────────────────────────────────────────

const BottomGradient: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.88) 100%)',
      pointerEvents: 'none',
    }}
  />
);

// ── 水印 ─────────────────────────────────────────────────────────────────────

const Watermark: React.FC = () => (
  <AbsoluteFill
    style={{ justifyContent: 'flex-end', alignItems: 'flex-end', padding: '0 40px 52px 0', pointerEvents: 'none' }}
  >
    <span
      style={{
        color: 'rgba(255,255,255,0.22)',
        fontSize: 52,
        fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
        fontWeight: 700,
        letterSpacing: 4,
      }}
    >
      紅賊
    </span>
  </AbsoluteFill>
);

const KenBurnsPhoto: React.FC<{ src: string; index: number }> = ({ src, index }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;

  const startScale = 1.0;
  const endScale = 1.12;
  const scale = interpolate(progress, [0, 1], [startScale, endScale]);
  const txStart = index % 2 === 0 ? 0 : 2;
  const txEnd = index % 2 === 0 ? 2 : 0;
  const tyStart = index % 3 === 0 ? 0 : 1;
  const tyEnd = index % 3 === 0 ? 1 : 0;
  const tx = interpolate(progress, [0, 1], [txStart, txEnd]);
  const ty = interpolate(progress, [0, 1], [tyStart, tyEnd]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          objectFit: 'cover',
          width: '100%',
          height: '100%',
          opacity: 0.72,
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

interface BackgroundSegmentProps {
  bgSrc: string;
  duration: number;
  index: number;
}

const BackgroundSegment: React.FC<BackgroundSegmentProps> = ({ bgSrc, duration, index }) => {
  const frame = useCurrentFrame();
  const FADE = 12;
  const opacity = interpolate(
    frame,
    [0, FADE, duration - FADE, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      {/\.(jpg|jpeg|png|webp)$/i.test(bgSrc) ? (
        <KenBurnsPhoto src={staticFile(bgSrc)} index={index} />
      ) : (
        <Video src={staticFile(bgSrc)} loop style={{ opacity: 0.72, objectFit: 'cover' }} />
      )}
    </AbsoluteFill>
  );
};

// ── 字幕（數字/單位自動標黃）────────────────────────────────────────────────

const highlightText = (text: string): React.ReactNode[] => {
  // 數字 + 可能跟著的單位
  const parts = text.split(/([\d０-９]+(?:[a-zA-Z%秒分鐘小時天年個次倍億萬]+)?)/g);
  return parts.map((part, i) =>
    /\d/.test(part) ? (
      <span key={i} style={{ color: '#FFD700', fontWeight: 700 }}>
        {part}
      </span>
    ) : (
      part
    )
  );
};

const SubtitleLine: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const ty = interpolate(frame, [0, 8], [10, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 52px 96px' }}
    >
      <div
        style={{
          opacity: op,
          transform: `translateY(${ty}px)`,
          maxWidth: '90%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            color: '#ffffff',
            fontSize: 50,
            fontFamily: 'Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif',
            fontWeight: 600,
            lineHeight: 1.55,
            letterSpacing: 1,
            textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8)',
          }}
        >
          {highlightText(text)}
        </span>
      </div>
    </AbsoluteFill>
  );
};

const WordCaptionLine: React.FC<{ words: WordTimestamp[]; segmentStartSec: number }> = ({
  words,
  segmentStartSec: _segmentStartSec,
}) => {
  const frame = useCurrentFrame();
  const currentMs = (frame / 30) * 1000;

  return (
    <AbsoluteFill
      style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 52px 96px' }}
    >
      <div style={{ maxWidth: '90%', textAlign: 'center' }}>
        <span
          style={{
            fontSize: 50,
            fontFamily: 'Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif',
            fontWeight: 600,
            lineHeight: 1.55,
            letterSpacing: 1,
            textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8)',
          }}
        >
          {words.map((w, i) => {
            const active = currentMs >= w.startMs && currentMs < w.startMs + w.durationMs;
            return (
              <span
                key={i}
                style={{
                  color: active ? '#FFD700' : '#ffffff',
                  fontWeight: active ? 700 : 600,
                }}
              >
                {w.word}
              </span>
            );
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ── 主元件 ───────────────────────────────────────────────────────────────────

export const VideoSkill: React.FC<VideoSkillProps> = ({
  subtitles,
  audioSrc,
  bgVideoSrcs,
  durationInSeconds,
  category,
  wordTimestamps,
  bgMusicSrc,
  bgMusicVolume = 0.15,
}) => {
  const fps = 30;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* 每句字幕對應一支背景影片，依時間點切換 */}
      {subtitles.map((sub, i) => {
        const bgSrc = bgVideoSrcs[Math.min(i, bgVideoSrcs.length - 1)];
        const from = Math.floor(sub.startSec * fps);
        const duration = Math.max(1, Math.floor((sub.endSec - sub.startSec) * fps));
        return (
          <Sequence key={`bg-${i}`} from={from} durationInFrames={duration}>
            <BackgroundSegment bgSrc={bgSrc} duration={duration} index={i} />
          </Sequence>
        );
      })}

      {/* 底部漸層，讓字幕區更易讀 */}
      <BottomGradient />

      {/* 背景音樂（可選，循環，低音量） */}
      {bgMusicSrc && (
        <Audio
          src={staticFile(bgMusicSrc)}
          volume={(f: number) => {
            const timeSec = f / fps;
            let inSub = false;
            let framesFromEdge = Infinity;
            for (const sub of subtitles) {
              const fromStart = (timeSec - sub.startSec) * fps;
              const fromEnd = (sub.endSec - timeSec) * fps;
              if (fromStart >= 0 && fromEnd >= 0) {
                inSub = true;
                framesFromEdge = Math.min(fromStart, fromEnd);
                break;
              }
              framesFromEdge = Math.min(framesFromEdge, Math.abs(fromStart), Math.abs(fromEnd));
            }
            const FADE_FRAMES = 20;
            const low = (bgMusicVolume ?? 0.15) * 0.25;
            const high = bgMusicVolume ?? 0.15;
            if (inSub) {
              return interpolate(Math.min(framesFromEdge, FADE_FRAMES), [0, FADE_FRAMES], [high, low], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
            }
            return interpolate(Math.min(framesFromEdge, FADE_FRAMES), [0, FADE_FRAMES], [low, high], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
          }}
          loop
        />
      )}

      {/* TTS 音軌 */}
      <Audio src={staticFile(audioSrc)} />

      {/* 頂部進度條 */}
      <ProgressBar />

      {/* 類別標籤 */}
      <CategoryTag label={category} />

      {/* 水印 */}
      <Watermark />

      {/* 字幕序列 */}
      {subtitles.map((sub, i) => {
        const from = Math.floor(sub.startSec * fps);
        const duration = Math.max(1, Math.floor((sub.endSec - sub.startSec) * fps));
        const words = wordTimestamps?.[i];
        return (
          <Sequence key={`sub-${i}`} from={from} durationInFrames={duration}>
            {words && words.length > 0 ? (
              <WordCaptionLine words={words} segmentStartSec={sub.startSec} />
            ) : (
              <SubtitleLine text={sub.text} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const calculateMetadata: CalculateMetadataFunction<VideoSkillProps> = async ({ props }) => ({
  durationInFrames: Math.ceil(props.durationInSeconds * 30),
});
