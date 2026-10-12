/* eslint-disable unicorn/prefer-await -- CommonJS has no top-level `await`, and common-proxy takes a promise of the handler */
import { commonProxyDecorator } from 'common-proxy';

export default commonProxyDecorator(import('./decorator.js'));

export const proxiedAsyncDecorator = commonProxyDecorator(
    import('./decorator.js').then(x => x.asyncDecorator)
);
