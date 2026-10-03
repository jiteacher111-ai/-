import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {PROJECT_DIR, chromiumExecutable} from './paths.mjs';

export const prepare = async () => {
  const serveUrl = await bundle({entryPoint: path.join(PROJECT_DIR, 'src', 'index.ts'), publicDir: path.join(PROJECT_DIR, 'public')});
  const browserExecutable = chromiumExecutable();
  const composition = await selectComposition({serveUrl, id: 'DinoPlayground', browserExecutable});
  return {serveUrl, composition, browserExecutable};
};

export {renderMedia, renderStill};

export const progressLogger = (label) => {
  let last = -1;
  return ({progress}) => {
    const p = Math.floor(progress * 20);
    if (p !== last) (last = p, process.stdout.write(`\r${label} ${Math.round(progress * 100)}%`));
    if (progress >= 1) process.stdout.write('\n');
  };
};
