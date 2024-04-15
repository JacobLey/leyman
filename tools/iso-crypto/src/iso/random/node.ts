import { randomBytes as randomBytesCb } from 'node:crypto';
import { promisify } from 'node:util';
import type * as Random from './types.js';

export const randomBytes: (typeof Random)['randomBytes'] = promisify(randomBytesCb);
