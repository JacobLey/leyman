<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { demos, packages, projectOf } from '../registry.js';
import Cards from './Cards.vue';

const { page } = useData();

const slug = computed(() => {
    const found = projectOf(page.value.relativePath);
    return found?.kind === 'package' ? found.project.slug : undefined;
});

// Related is declared on one side, and shown on both
const relatedPackages = computed(() => {
    const own = packages.find(pkg => pkg.slug === slug.value);
    return packages
        .filter(
            other =>
                other !== own &&
                (own?.related?.includes(other.slug) ||
                    (slug.value && other.related?.includes(slug.value)))
        )
        .map(({ slug: other, title, pitch }) => ({
            title,
            link: `/packages/${other}/`,
            details: pitch,
        }));
});

const usedIn = computed(() =>
    demos
        .filter(demo => slug.value && demo.uses.includes(slug.value))
        .map(({ slug: demo, title, pitch }) => ({ title, link: `/demos/${demo}/`, details: pitch }))
);
</script>

<template>
    <template v-if="relatedPackages.length">
        <h3 class="heading">Packages</h3>
        <Cards :cards="relatedPackages" />
    </template>
    <template v-if="usedIn.length">
        <h3 class="heading">Used in demos</h3>
        <Cards :cards="usedIn" />
    </template>
</template>
