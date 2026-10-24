<script setup lang="ts">
import { categories, categoryId, packageLink, packagesIn } from '../registry.js';
import Cards from './Cards.vue';

const cards = categories.map(category => ({
    title: category,
    link: `/packages/#${categoryId(category)}`,
    links: packagesIn(category).map(({ slug }) => packageLink(slug)),
}));
</script>

<template>
    <Cards :cards="cards" />
</template>
