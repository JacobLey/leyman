import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { after, before } from 'mocha-chain';

/**
 * A browser-like `document` (happy-dom) for the suite it's called in.
 */
export const withDom = (): void => {
    before(() => {
        GlobalRegistrator.register({ url: 'https://main.leyman.localhost/' });
    });
    after(async () => {
        await GlobalRegistrator.unregister();
    });
};

/**
 * Sets the page to index.html's, with the given `<meta>` names.
 *
 * @param metas - `<meta name>` to `content`
 */
export const setPage = (metas: Record<string, string>): void => {
    const { document } = globalThis;
    document.head.replaceChildren(
        ...Object.entries(metas).map(([name, content]) => {
            const meta = document.createElement('meta');
            meta.name = name;
            meta.content = content;
            return meta;
        })
    );
    const greeting = document.createElement('h1');
    greeting.id = 'greeting';
    greeting.textContent = 'Loading…';
    document.body.replaceChildren(greeting);
};
