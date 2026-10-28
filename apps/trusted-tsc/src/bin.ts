import { main } from './lib/main.js';

// eslint-disable-next-line n/no-process-env -- tsc, and so its content mappers, run with the caller's environment
process.exitCode = await main(process.argv.slice(2), process.cwd(), process.env);
