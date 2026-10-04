import raw from './generated/project-data.json';
import type {ProjectData} from './types';

export const projectData = raw as unknown as ProjectData;
