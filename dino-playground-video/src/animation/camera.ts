import {Easing, interpolate} from 'remotion';
import type {Camera} from '../types';

/**
 * 카메라: (x, y) 지점을 화면 중앙에 두고 scale 배 확대. 배경이 항상 화면을 덮도록 이동량을 제한한다
 * (가장자리에 빈 공간·검은 프레임이 생기지 않게). 반환값은 원점 0,0 기준 CSS transform.
 */
export const cameraTransform = (cam: Camera, frame: number, duration: number, W: number, H: number) => {
  const t = interpolate(frame, [0, Math.max(1, duration - 1)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)});
  const s = cam.scaleFrom + (cam.scaleTo - cam.scaleFrom) * t;
  const cx = cam.xFrom + (cam.xTo - cam.xFrom) * t;
  const cy = cam.yFrom + (cam.yTo - cam.yFrom) * t;
  const tx = Math.min(0, Math.max(W * (1 - s), W / 2 - s * cx * W));
  const ty = Math.min(0, Math.max(H * (1 - s), H / 2 - s * cy * H));
  return {s, tx, ty, css: `translate(${tx}px, ${ty}px) scale(${s})`};
};
