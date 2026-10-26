import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { setPage, withDom } from '../helpers/dom.js';

const greeting = (): string | null | undefined =>
    globalThis.document.querySelector('#greeting')?.textContent;

suite('page', () => {
    withDom();

    test('Shows both names', async () => {
        const { renderGreeting } = await import('#internal/page.js');
        setPage({ worktree: 'feat-x', repo: 'leyman' });
        renderGreeting(globalThis.document);
        expect(greeting()).to.equal('You are loading feat-x in leyman');
        expect(
            [...globalThis.document.querySelectorAll('#greeting strong')].map(
                strong => strong.textContent
            )
        ).to.deep.equal(['feat-x', 'leyman']);
    });

    test('Names are text, never markup', async () => {
        const { renderGreeting } = await import('#internal/page.js');
        setPage({ worktree: '<img src=x>', repo: 'leyman' });
        renderGreeting(globalThis.document);
        expect(globalThis.document.querySelector('#greeting img')).to.equal(null);
        expect(globalThis.document.querySelector('#greeting strong')?.textContent).to.equal(
            '<img src=x>'
        );
    });

    test('Says so when the names are missing', async () => {
        const { renderGreeting } = await import('#internal/page.js');
        setPage({});
        renderGreeting(globalThis.document);
        expect(greeting()).to.equal('You are loading an unknown worktree in an unknown repo');
    });

    test('Does nothing without a greeting element', async () => {
        const { renderGreeting } = await import('#internal/page.js');
        setPage({});
        globalThis.document.body.replaceChildren();
        renderGreeting(globalThis.document);
        expect(globalThis.document.body.childNodes).to.have.length(0);
    });

    test('main renders on load', async () => {
        setPage({ worktree: 'feat-x', repo: 'leyman' });
        await import('#internal/main.js');
        expect(greeting()).to.equal('You are loading feat-x in leyman');
    });
});
