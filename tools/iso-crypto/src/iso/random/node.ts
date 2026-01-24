import type * as Random from './types.js';
import { randomBytes as randomBytesCb } from 'node:crypto';
import { promisify } from 'node:util';

export const randomBytes: (typeof Random)['randomBytes'] = promisify(randomBytesCb);
