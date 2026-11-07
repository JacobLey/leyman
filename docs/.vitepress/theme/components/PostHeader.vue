<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed } from 'vue';
import { packageLink } from '../registry.js';
import { data as posts } from '../posts.data.js';

const { page } = useData();

const post = computed(() => {
    const url = `/${page.value.relativePath.replace(/\.md$/v, '')}`;
    return posts.find(candidate => candidate.url === url);
});
</script>

<template>
    <p v-if="post" class="post-header">
        <time :datetime="post.date">{{ post.date }}</time>
        <template v-for="slug in post.packages" :key="slug">
            · <a :href="withBase(packageLink(slug).link)">{{ packageLink(slug).text }}</a>
        </template>
        · <a :href="withBase('/blog/')">All posts</a>
    </p>
</template>

<style scoped>
.post-header {
    font-size: 14px;
    color: var(--vp-c-text-2);
}
</style>
