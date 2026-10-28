import { serve } from './lib/serve.js';

/**
 * The content mapper process TypeScript starts: requests on stdin, responses on stdout.
 */
export default serve(process.stdin, process.stdout);
