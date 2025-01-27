import { commonProxy } from 'common-proxy';
import { handler } from 'nx-plugin-handler';

export default handler(commonProxy(import('./index.js')));
