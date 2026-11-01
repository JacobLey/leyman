// One fresh process per measurement, so nothing is warm. Prints the result as JSON
import type { HashName } from './hashes.js';
import { loaders } from './hashes.js';
import { makeBytes, measureCold } from './measure.js';

const [name, size] = globalThis.process.argv.slice(2);
// eslint-disable-next-line no-console -- Read by the bench's runner
console.log(JSON.stringify(await measureCold(loaders[name as HashName], makeBytes(Number(size)))));
