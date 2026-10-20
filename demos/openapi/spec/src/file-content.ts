// eslint-disable-next-line import-x/no-extraneous-dependencies -- Only loaded by the populate-files target
import type { PopulateFileParams } from 'load-populate-files';
import { spec } from './spec.js';

export default [{ filePath: './openapi.json', content: spec }] satisfies PopulateFileParams[];
