/**
 * Fills `#greeting` with the names `worktreeNamesPlugin` wrote into the page.
 *
 * @param document - the page
 */
export const renderGreeting = (document: Document): void => {
    const name = (selector: string, fallback: string): HTMLElement => {
        const strong = document.createElement('strong');
        strong.textContent = document.querySelector<HTMLMetaElement>(selector)?.content ?? fallback;
        return strong;
    };

    document
        .querySelector('#greeting')
        ?.replaceChildren(
            'You are loading ',
            name('meta[name="worktree"]', 'an unknown worktree'),
            ' in ',
            name('meta[name="repo"]', 'an unknown repo')
        );
};
