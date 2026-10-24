<script setup lang="ts">
import { demos, packageLink } from '../registry.js';
import Cards from './Cards.vue';

const cards = demos.map(({ slug, title, pitch, uses }) => ({
    title,
    link: `/demos/${slug}/`,
    details: pitch,
    linksLabel: 'Uses',
    links: uses.map(packageLink),
}));
</script>

<template>
    <Cards :cards="cards" />
</template>
