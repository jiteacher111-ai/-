import React from 'react';
import {Composition, continueRender, delayRender} from 'remotion';
import '@fontsource/jua';
import {DinoPlayground} from './DinoPlayground';
import {projectData} from './data';

// 한글 자막 폰트(Jua, 로컬 패키지)가 로드된 뒤에 프레임을 찍는다
const fontHandle = delayRender('Jua 폰트 로딩');
document.fonts
  .load("48px 'Jua'", '성운이와 공룡')
  .then(() => document.fonts.ready)
  .finally(() => continueRender(fontHandle));

export const RemotionRoot: React.FC = () => {
  const {meta} = projectData;
  return (
    <Composition
      id="DinoPlayground"
      component={DinoPlayground}
      durationInFrames={Math.max(1, meta.durationInFrames)}
      fps={meta.fps}
      width={meta.width}
      height={meta.height}
    />
  );
};
