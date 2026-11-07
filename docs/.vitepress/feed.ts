import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMarkdownRenderer } from 'vitepress';
import type { Post } from './blog.js';

const escapeXml = (text: string): string =>
    text.replaceAll(/[&<>"']/gv, char => `&#${char.codePointAt(0)};`);

/**
 * The code a reader should see from a twoslash `ts` block: what follows `// ---cut---`, without
 * the `// @errors`-style directives and `// ^?` queries, which only drive the type-checker.
 */
const visibleCode = (code: string): string => {
    const cut = code.lastIndexOf('// ---cut---\n');
    return (cut === -1 ? code : code.slice(cut + '// ---cut---\n'.length))
        .split('\n')
        .filter(line => !/^\s*\/\/\s*(?:@\w+|\^\?)/v.test(line))
        .join('\n');
};

/**
 * A post's body as plain HTML for sites that import the feed (dev.to converts it to markdown):
 * code blocks as `<pre><code class="language-…">` without highlighting or type popups, the post
 * header dropped (the feed item has the date), any other component (a live report) replaced by a
 * link to the post, which has it, and every site path made absolute.
 */
const renderers = async (srcDir: string, siteUrl: string) => {
    const base = new URL(siteUrl).pathname;
    const md = await createMarkdownRenderer(srcDir, {}, '/');
    md.renderer.rules.fence = (tokens, index) => {
        const { info, content } = tokens[index] ?? { info: '', content: '' };
        const [lang = ''] = info.trim().split(/\s/v);
        const code = lang === 'ts' ? visibleCode(content) : content;
        return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${md.utils.escapeHtml(code)}</code></pre>\n`;
    };
    return (post: Post, src: string): string => {
        const link = `${siteUrl}${post.url.slice(1)}`;
        const body = src
            // Frontmatter, the title (the feed item has it), HTML comments and the post header
            .replace(/^---\n[\s\S]*?\n---\n/v, '')
            .replace(/^# .*\n/mv, '')
            .replaceAll(/<!--[\s\S]*?-->\n?/gv, '')
            .replaceAll(/^<PostHeader \/>\n/gmv, '')
            .replaceAll(
                /^<[A-Z]\w* \/>$/gmv,
                `<p><a href="${link}">This part is interactive: see it on the original post.</a></p>`
            );
        return (
            md
                .render(body, { relativePath: post.url.slice(1) })
                // Heading permalinks only make sense on the site
                .replaceAll(/ <a class="header-anchor"[^>]*>[^<]*<\/a>/gv, '')
                // Site paths, which the renderer prefixes with `base` and gives a `.html`
                // extension the site's clean URLs don't use
                .replaceAll(
                    /(?<= (?:href|src)=")\/(?!\/)[^"#]*/gv,
                    path =>
                        `${siteUrl}${(path.startsWith(base) ? path.slice(base.length) : path.slice(1)).replace(/\.html$/v, '')}`
                )
        );
    };
};

/**
 * Writes the blog's RSS feed to `/blog/feed.xml`, newest first, with each post's full content.
 * Each item's link is the post's page, so a site importing the feed (dev.to) can mark it as the
 * canonical URL.
 */
export const writeFeed = async (
    outDir: string,
    srcDir: string,
    siteUrl: string,
    posts: readonly Post[]
): Promise<void> => {
    const render = await renderers(srcDir, siteUrl);
    const items = posts.map(post => {
        const link = `${siteUrl}${post.url.slice(1)}`;
        const html = render(post, readFileSync(`${srcDir}${post.url.slice(1)}.md`, 'utf8'));
        return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(post.description)}</description>
      <content:encoded><![CDATA[${html.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`;
    });
    mkdirSync(join(outDir, 'blog'), { recursive: true });
    writeFileSync(
        join(outDir, 'blog', 'feed.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Leyman blog</title>
    <link>${siteUrl}blog/</link>
    <atom:link href="${siteUrl}blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Benchmarks, comparisons and stories behind the Leyman TypeScript packages.</description>
    <language>en</language>
${items.join('\n')}
  </channel>
</rss>
`
    );
};
