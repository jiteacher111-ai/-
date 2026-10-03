import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import type {AudioCue, VoiceLine} from '../types';

/**
 * 대사·음악·효과음 배치. 실제로 존재하는 파일만 넣는다 (없으면 무음, 대체 파일 생성 금지).
 * 프레임은 전체 영상 기준.
 */
export const AudioTimeline: React.FC<{voiceLines: VoiceLine[]; cues: AudioCue[]; durationInFrames: number}> = ({voiceLines, cues, durationInFrames}) => (
  <>
    {cues
      .filter((c) => c.exists)
      .map((c, i) => (
        <Sequence key={`c${i}`} from={c.from} durationInFrames={Math.max(1, (c.to ?? durationInFrames) - c.from)} layout="none">
          <Audio src={staticFile(c.asset)} volume={c.kind === 'music' ? Math.min(c.volume, 0.45) : c.volume} />
        </Sequence>
      ))}
    {voiceLines
      .filter((l) => l.audioExists && l.audio && l.from !== null)
      .map((l) => (
        <Sequence key={l.id} from={l.from!} layout="none">
          <Audio src={staticFile(l.audio!)} />
        </Sequence>
      ))}
  </>
);
