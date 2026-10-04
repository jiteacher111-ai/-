import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {projectData} from '../data';
import {FONT_FAMILY, SUBTITLE} from '../styles/subtitles';
import type {SubtitleCue} from '../types';

/** subtitles.ko.srt 를 같은 문구·같은 타이밍으로 번인. 하단 10% 위, 너비 82% 이내, 최대 두 줄. */
export const SubtitleLayer: React.FC<{cues: SubtitleCue[]}> = ({cues}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const cue = cues.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const op = Math.min(interpolate(frame, [cue.from, cue.from + 3], [0, 1], {extrapolateRight: 'clamp'}), interpolate(frame, [cue.to - 3, cue.to], [1, 0], {extrapolateLeft: 'clamp'}));
  const fs = H * SUBTITLE.fontSizeRatio;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: H * projectData.meta.subtitleBottom}}>
      <div
        style={{
          opacity: op,
          maxWidth: W * projectData.meta.subtitleMaxWidth,
          maxHeight: fs * SUBTITLE.lineHeight * SUBTITLE.maxLines + H * 0.03,
          overflow: 'hidden',
          fontFamily: FONT_FAMILY,
          fontSize: fs,
          lineHeight: SUBTITLE.lineHeight,
          color: SUBTITLE.color,
          background: SUBTITLE.background,
          borderRadius: fs * 0.5,
          padding: `${H * 0.012}px ${fs * 0.7}px`,
          textAlign: 'center',
          whiteSpace: 'pre-line',
          wordBreak: 'keep-all',
          textShadow: '0 2px 3px rgba(40,20,10,0.5)',
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};
