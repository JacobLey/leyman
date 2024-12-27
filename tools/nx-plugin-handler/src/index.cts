import { commonProxyDecorator } from 'common-proxy';

// biome-ignore lint: Doesn't support being disabled directly
export type { HandlerWrapper, RawHandler, PluginContext } from './index.js' with {
    'resolution-mode': 'import',
};

export const handler = commonProxyDecorator(import('./index.js').then(x => x.handler));
