import {execFileSync} from 'node:child_process';

/** ffprobe 로 길이·해상도·오디오 스트림 확인 (시스템 ffprobe 없으면 null) */
export const probe = (file) => {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', file], {encoding: 'utf8'});
    const j = JSON.parse(out);
    const v = j.streams.find((s) => s.codec_type === 'video');
    return {duration: Number(j.format.duration), video: v ? {codec: v.codec_name, width: v.width, height: v.height, fps: v.r_frame_rate, frames: Number(v.nb_frames)} : null, hasAudio: j.streams.some((s) => s.codec_type === 'audio')};
  } catch {
    return null;
  }
};
