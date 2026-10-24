import { type Category, categories, demos, infrastructure, packages } from '../projects.js';

export { categories, demos, infrastructure, packages };

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

const infrastructureTitles = new Map(infrastructure.map(({ slug, title }) => [slug, title]));

export const infrastructureLink = (slug: string): { text: string; link: string } => ({
    text: infrastructureTitles.get(slug) ?? slug,
    link: `/infrastructure/${slug}/`,
});

/**
 * The package, demo or infrastructure entry an overview page (`packages/<slug>/index.md`,
 * `demos/<slug>/index.md`, `infrastructure/<slug>/index.md`) is about.
 */
export const projectOf = (
    relativePath: string
):
    | { readonly kind: 'package'; readonly project: (typeof packages)[number] }
    | { readonly kind: 'demo'; readonly project: (typeof demos)[number] }
    | { readonly kind: 'infrastructure'; readonly project: (typeof infrastructure)[number] }
    | undefined => {
    const [section, slug] = relativePath.split('/');
    const pkg = section === 'packages' ? packages.find(p => p.slug === slug) : undefined;
    if (pkg) {
        return { kind: 'package', project: pkg };
    }
    const demo = section === 'demos' ? demos.find(d => d.slug === slug) : undefined;
    if (demo) {
        return { kind: 'demo', project: demo };
    }
    const entry =
        section === 'infrastructure' ? infrastructure.find(i => i.slug === slug) : undefined;
    return entry && { kind: 'infrastructure', project: entry };
};
