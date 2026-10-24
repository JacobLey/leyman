<script setup lang="ts">
import { categories, categoryId, packagesIn } from '../registry.js';
import Cards from './Cards.vue';

const sections = categories.map(category => ({
    category,
    id: categoryId(category),
    cards: packagesIn(category).map(({ slug, title, pitch }) => ({
        title,
        link: `/packages/${slug}/`,
        details: pitch,
    })),
}));
</script>

<template>
    <template v-for="section in sections" :key="section.id">
        <h2 :id="section.id" tabindex="-1">
            {{ section.category }}
            <a class="header-anchor" :href="`#${section.id}`" :aria-label="`Permalink to ${section.category}`"></a>
        </h2>
        <Cards :cards="section.cards" />
    </template>
</template>
