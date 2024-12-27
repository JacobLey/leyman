import { commonProxyDecorator } from 'common-proxy';

export default commonProxyDecorator(import('./decorator.js'));

export const proxiedAsyncDecorator = commonProxyDecorator(
    import('./decorator.js').then(x => x.asyncDecorator)
);
