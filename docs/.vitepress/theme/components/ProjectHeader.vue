<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed } from 'vue';
import type { Links } from '../../projects.js';
import { demoLink, packageLink, projectOf } from '../registry.js';

const { page, theme } = useData<{ links: Links }>();

interface Row {
    /**
     * Empty for a page's only row.
     */
    readonly label: string;
    readonly links: readonly {
        readonly text: string;
        readonly href: string;
        readonly external: boolean;
    }[];
}

const external = (text: string, href: string) => ({ text, href, external: true });
const internal = ({ text, link }: { text: string; link: string }) => ({
    text,
    href: withBase(link),
    external: false,
});

const rows = computed((): Row[] => {
    const found = projectOf(page.value.relativePath);
    if (!found) {
        return [];
    }
    if (found.kind === 'package') {
        const sources = theme.value.links.packages[found.project.slug] ?? [];
        // Rows are labelled by npm name only when the pages cover several packages
        return sources.map(({ name, npm, source, changelog }) => ({
            label: sources.length > 1 ? name : '',
            links: [
                external('npm', npm),
                external('Source', source),
                external('Changelog', changelog),
            ],
        }));
    }
    const { source, files } = theme.value.links.demos[found.project.slug] ?? {
        source: '',
        files: [],
    };
    const { project } = found;
    return [
        { label: 'Source', links: [external(project.source, source)] },
        { label: 'Files', links: files.map(({ label, url }) => external(label, url)) },
        { label: 'Uses', links: project.uses.map(slug => internal(packageLink(slug))) },
        ...(project.related?.length
            ? [{ label: 'See also', links: project.related.map(slug => internal(demoLink(slug))) }]
            : []),
    ];
});
</script>

<template>
    <dl v-if="rows.length" class="project-header" :class="{ unlabelled: !rows[0]?.label }">
        <template v-for="row in rows" :key="row.label">
            <dt v-if="row.label">{{ row.label }}</dt>
            <dd>
                <template v-for="(link, index) in row.links" :key="link.href">
                    <template v-if="index > 0"> · </template>
                    <a
                        :href="link.href"
                        :target="link.external ? '_blank' : undefined"
                        :rel="link.external ? 'noreferrer' : undefined"
                        >{{ link.text }}</a
                    >
                </template>
            </dd>
        </template>
    </dl>
</template>

<style scoped>
.project-header {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 16px 0 24px;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: var(--vp-c-bg-soft);
    font-size: 14px;
    line-height: 22px;
}

.unlabelled {
    grid-template-columns: 1fr;
}

dt {
    font-weight: 500;
    color: var(--vp-c-text-2);
}

dd {
    margin: 0;
    color: var(--vp-c-text-3);
}

dd a {
    white-space: nowrap;
}
</style>
