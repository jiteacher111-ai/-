import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import type {AudioCue, VoiceLine} from '../types';

const DUCK_DB = -4; // 대사 중 BGM 3~5dB 감쇄
const DUCK_PRE = 4; // 대사 4프레임 전부터
const DUCK_POST = 8; // 대사 종료 8프레임 뒤 복구

/**
 * 실제로 존재하는 대사·음악·효과음만 배치한다 (없으면 무음 — 대체 파일을 만들지 않는다).
 * 합창(all) 대사는 renderAs 네 파일을 같은 시작점에 둔다.
 */
export const AudioTimeline: React.FC<{voiceLines: VoiceLine[]; cues: AudioCue[]; durationInFrames: number}> = ({voiceLines, cues, durationInFrames}) => {
  const duck = (globalFrame: number) => (voiceLines.some((l) => globalFrame >= l.from - DUCK_PRE && globalFrame < l.to + DUCK_POST) ? Math.pow(10, DUCK_DB / 20) : 1);
  return (
    <>
      {cues
        .filter((c) => c.exists)
        .map((c, i) => (
          <Sequence key={`c${i}`} from={c.from} durationInFrames={Math.max(1, (c.to ?? durationInFrames) - c.from)} layout="none">
            <Audio src={staticFile(c.file)} volume={(f) => (c.kind === 'music' ? c.volume * duck(c.from + f) : c.volume)} />
          </Sequence>
        ))}
      {voiceLines.flatMap((l) =>
        l.audio
          .filter((a) => a.exists)
          .map((a) => (
            <Sequence key={a.file} from={l.from} layout="none">
              <Audio src={staticFile(a.file)} />
            </Sequence>
          )),
      )}
    </>
  );
};
