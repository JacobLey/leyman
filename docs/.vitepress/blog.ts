import { createContentLoader } from 'vitepress';
import { packages } from './projects.js';

/**
 * A blog post, from the frontmatter of `docs/src/blog/<slug>.md`.
 */
export interface Post {
    /**
     * Site path, without `base` (`/blog/<slug>`).
     */
    readonly url: string;
    readonly title: string;
    readonly description: string;
    /**
     * Publication date, `YYYY-MM-DD`.
     */
    readonly date: string;
    /**
     * Slugs of the documented packages the post is about.
     */
    readonly packages: readonly string[];
}

const packageSlugs = new Set(packages.map(({ slug }) => slug));

/**
 * YAML reads an unquoted `2026-11-07` as a Date (at midnight UTC), so both forms are accepted.
 */
const toDate = (value: unknown): string | undefined => {
    const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/v.test(date) ? date : undefined;
};

/**
 * Loads every post (not the `/blog/` index), newest first. Fails, in the dev server and the build,
 * when a post's frontmatter is incomplete, names a package that isn't documented, or the post is
 * missing `<PostHeader />` under its title.
 */
export const createPostsLoader = () =>
    createContentLoader('blog/*.md', {
        includeSrc: true,
        transform(pages): Post[] {
            const problems: string[] = [];
            const posts = pages
                .filter(({ url }) => url !== '/blog/')
                .map(({ url, src = '', frontmatter }): Post => {
                    const { title, description, packages: about = [] } = frontmatter;
                    const date = toDate(frontmatter.date);
                    for (const [field, value] of [
                        ['title', title],
                        ['description', description],
                    ] as const) {
                        if (typeof value !== 'string' || value === '') {
                            problems.push(`${url}: frontmatter needs a "${field}"`);
                        }
                    }
                    if (date === undefined) {
                        problems.push(`${url}: frontmatter needs a "date" (YYYY-MM-DD)`);
                    }
                    if (
                        !Array.isArray(about) ||
                        about.some(slug => typeof slug !== 'string' || !packageSlugs.has(slug))
                    ) {
                        problems.push(
                            `${url}: "packages" must list slugs of documented packages (projects.ts)`
                        );
                    }
                    if (!src.includes('<PostHeader />')) {
                        problems.push(`${url}: missing <PostHeader /> under its title`);
                    }
                    return {
                        url,
                        title: String(title),
                        description: String(description),
                        date: date ?? '',
                        packages: Array.isArray(about) ? about.map(String) : [],
                    };
                });
            if (problems.length > 0) {
                throw new Error(`docs/src/blog:\n${problems.join('\n')}`);
            }
            return posts.toSorted(
                (a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url)
            );
        },
    });
