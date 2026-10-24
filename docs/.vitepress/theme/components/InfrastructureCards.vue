<script setup lang="ts">
import { infrastructure, packageLink } from '../registry.js';
import Cards from './Cards.vue';

const cards = infrastructure.map(({ slug, title, pitch, uses }) => ({
    title,
    link: `/infrastructure/${slug}/`,
    details: pitch,
    linksLabel: 'Uses',
    links: uses.map(packageLink),
}));
</script>

<template>
    <Cards :cards="cards" />
</template>
