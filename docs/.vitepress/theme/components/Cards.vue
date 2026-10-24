<script setup lang="ts">
import { withBase } from 'vitepress';
import type { Card } from '../registry.js';

defineProps<{ cards: readonly Card[] }>();
</script>

<template>
    <ul class="cards vp-raw">
        <li v-for="card in cards" :key="card.link" class="card">
            <a class="title" :href="withBase(card.link)">{{ card.title }}</a>
            <p v-if="card.details" class="details">{{ card.details }}</p>
            <p v-if="card.links?.length" class="links">
                <span v-if="card.linksLabel" class="label">{{ card.linksLabel }}</span>
                <template v-for="(link, index) in card.links" :key="link.link">
                    <template v-if="index > 0"> · </template>
                    <a :href="withBase(link.link)">{{ link.text }}</a>
                </template>
            </p>
        </li>
    </ul>
</template>

<style scoped>
.cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
    margin: 16px 0 32px;
    padding: 0;
    list-style: none;
}

.card {
    /* Inside a page's content, list items get spacing between them */
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 20px;
    border: 1px solid var(--vp-c-bg-soft);
    border-radius: 12px;
    background-color: var(--vp-c-bg-soft);
    transition: border-color 0.25s;
}

.card:hover {
    border-color: var(--vp-c-brand-1);
}

.title {
    text-decoration: none;
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
    color: var(--vp-c-text-1);
}

.title:hover {
    color: var(--vp-c-brand-1);
}

.details {
    margin: 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--vp-c-text-2);
}

.links {
    margin: auto 0 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--vp-c-text-3);
}

.label {
    margin-right: 6px;
    font-weight: 500;
    color: var(--vp-c-text-2);
}

.links a {
    color: var(--vp-c-brand-1);
    text-decoration: none;
    white-space: nowrap;
}

.links a:hover {
    text-decoration: underline;
}
</style>
