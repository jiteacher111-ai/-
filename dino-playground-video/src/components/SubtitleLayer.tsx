import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT_FAMILY, SAFE, SUBTITLE_ZONE} from '../config';
import type {SubtitleCue} from '../types';

/** subtitles.ko.srt 를 같은 문구·같은 타이밍으로 번인한다. 프레임은 전체 영상 기준. */
export const SubtitleLayer: React.FC<{cues: SubtitleCue[]}> = ({cues}) => {
  const frame = useCurrentFrame();
  const {height: H} = useVideoConfig();
  const cue = cues.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const op = Math.min(
    interpolate(frame, [cue.from, cue.from + 3], [0, 1], {extrapolateRight: 'clamp'}),
    interpolate(frame, [cue.to - 3, cue.to], [1, 0], {extrapolateLeft: 'clamp'}),
  );
  return (
    <AbsoluteFill style={{zIndex: 100, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: H * SUBTITLE_ZONE.bottom, paddingLeft: `${SAFE.x * 100 + 5}%`, paddingRight: `${SAFE.x * 100 + 5}%`}}>
      <div
        style={{
          opacity: op,
          maxHeight: H * SUBTITLE_ZONE.height,
          fontFamily: FONT_FAMILY,
          fontSize: H * 0.05,
          lineHeight: 1.3,
          color: '#fff',
          background: COLORS.subtitleBg,
          borderRadius: H * 0.025,
          padding: `${H * 0.012}px ${H * 0.035}px`,
          textAlign: 'center',
          whiteSpace: 'pre-line',
          wordBreak: 'keep-all',
          textShadow: '0 2px 4px rgba(0,0,0,0.35)',
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};
