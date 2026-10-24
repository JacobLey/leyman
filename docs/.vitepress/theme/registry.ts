import { type Category, categories, demos, packages } from '../projects.js';

export { categories, demos, packages };

export interface Card {
    readonly title: string;
    readonly link: string;
    readonly details?: string;
    readonly linksLabel?: string;
    readonly links?: readonly { readonly text: string; readonly link: string }[];
}

/**
 * Anchor of a category's section on `/packages/`, matching the `id` its heading is rendered with.
 */
export const categoryId = (category: Category): string =>
    category.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-');

export const packagesIn = (category: Category): typeof packages =>
    packages.filter(pkg => pkg.category === category);

const packageTitles = new Map(packages.map(({ slug, title }) => [slug, title]));
const demoTitles = new Map(demos.map(({ slug, title }) => [slug, title]));

export const packageLink = (slug: string): { text: string; link: string } => ({
    text: packageTitles.get(slug) ?? slug,
    link: `/packages/${slug}/`,
});

export const demoLink = (slug: string): { text: string; link: string } => ({
    text: demoTitles.get(slug) ?? slug,
    link: `/demos/${slug}/`,
});

/**
 * The package or demo an overview page (`packages/<slug>/index.md`, `demos/<slug>/index.md`) is
 * about.
 */
export const projectOf = (
    relativePath: string
):
    | { readonly kind: 'package'; readonly project: (typeof packages)[number] }
    | { readonly kind: 'demo'; readonly project: (typeof demos)[number] }
    | undefined => {
    const [section, slug] = relativePath.split('/');
    const pkg = section === 'packages' ? packages.find(p => p.slug === slug) : undefined;
    if (pkg) {
        return { kind: 'package', project: pkg };
    }
    const demo = section === 'demos' ? demos.find(d => d.slug === slug) : undefined;
    return demo && { kind: 'demo', project: demo };
};
