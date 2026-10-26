import type { HtmlTagDescriptor } from 'vite';
import type { IngressOptions } from '@leyman/demo-local-ingress';
import {
    createViteConfig,
    ingressOptionsFromEnv,
    ingressServerOptions,
    worktreeNamesPlugin,
} from '@leyman/demo-local-ingress';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const metaTags = (options: IngressOptions): HtmlTagDescriptor[] =>
    (worktreeNamesPlugin(options).transformIndexHtml as () => HtmlTagDescriptor[])();

suite('vite-config', () => {
    suite('ingressOptionsFromEnv', () => {
        test('Reads the names and tunnel host', () => {
            expect(
                ingressOptionsFromEnv({
                    WORKTREE_NAME: 'feat-x',
                    REPO_NAME: 'leyman',
                    TUNNEL_HOST: 'demo.ngrok.app',
                })
            ).to.deep.equal({ worktree: 'feat-x', repo: 'leyman', tunnelHost: 'demo.ngrok.app' });
        });

        test('Empty values are unset', () => {
            expect(ingressOptionsFromEnv({ WORKTREE_NAME: '', TUNNEL_HOST: '' })).to.deep.equal({
                worktree: undefined,
                repo: undefined,
                tunnelHost: undefined,
            });
        });

        test('Reads process.env by default', () => {
            // eslint-disable-next-line n/no-process-env -- Checking the default
            expect(ingressOptionsFromEnv()).to.deep.equal(ingressOptionsFromEnv(process.env));
        });
    });

    suite('ingressServerOptions', () => {
        test('Listens on every interface, on a fixed port', () => {
            expect(ingressServerOptions({})).to.deep.equal({
                host: '0.0.0.0',
                port: 5173,
                strictPort: true,
                allowedHosts: [],
            });
        });

        test('Allows a tunnel host', () => {
            expect(
                ingressServerOptions({ tunnelHost: 'demo.ngrok.app' }).allowedHosts
            ).to.deep.equal(['demo.ngrok.app']);
        });

        test('Leaves the hot reload WebSocket to follow the page', () => {
            const options = ingressServerOptions({ tunnelHost: 'demo.ngrok.app' });
            expect(options).to.not.have.property('hmr');
            expect(options).to.not.have.property('ws');
        });
    });

    suite('worktreeNamesPlugin', () => {
        test('Writes both names into the head', () => {
            expect(metaTags({ worktree: 'feat-x', repo: 'leyman' })).to.deep.equal([
                { tag: 'meta', attrs: { name: 'worktree', content: 'feat-x' }, injectTo: 'head' },
                { tag: 'meta', attrs: { name: 'repo', content: 'leyman' }, injectTo: 'head' },
            ]);
        });

        test('Leaves out a missing name', () => {
            expect(metaTags({ repo: 'leyman' })).to.deep.equal([
                { tag: 'meta', attrs: { name: 'repo', content: 'leyman' }, injectTo: 'head' },
            ]);
        });
    });

    suite('createViteConfig', () => {
        test('Combines the server options and the plugin', () => {
            const config = createViteConfig({ worktree: 'feat-x', repo: 'leyman' });
            expect(config.server).to.deep.equal(ingressServerOptions({}));
            expect(config.plugins).to.have.length(1);
        });

        test('Reads the environment by default', () => {
            expect(createViteConfig().server).to.deep.equal(
                ingressServerOptions(ingressOptionsFromEnv())
            );
        });
    });
});
