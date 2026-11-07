<script setup lang="ts">
import { withBase } from 'vitepress';
import { packageLink } from '../registry.js';
import { data as posts } from '../posts.data.js';
</script>

<template>
    <ul v-if="posts.length" class="posts vp-raw">
        <li v-for="post in posts" :key="post.url" class="post">
            <time :datetime="post.date">{{ post.date }}</time>
            <a class="title" :href="withBase(post.url)">{{ post.title }}</a>
            <p class="description">{{ post.description }}</p>
            <p v-if="post.packages.length" class="packages">
                <template v-for="(slug, index) in post.packages" :key="slug">
                    <template v-if="index > 0"> · </template>
                    <a :href="withBase(packageLink(slug).link)">{{ packageLink(slug).text }}</a>
                </template>
            </p>
        </li>
    </ul>
    <p v-else>No posts yet.</p>
</template>

<style scoped>
.posts {
    margin: 24px 0;
    padding: 0;
    list-style: none;
}

.post {
    margin: 0 0 28px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

time,
.packages {
    margin: 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--vp-c-text-3);
}

.title {
    font-size: 18px;
    font-weight: 600;
    line-height: 28px;
    color: var(--vp-c-text-1);
    text-decoration: none;
}

.title:hover {
    color: var(--vp-c-brand-1);
}

.description {
    margin: 0;
    color: var(--vp-c-text-2);
}

.packages a {
    color: var(--vp-c-brand-1);
    text-decoration: none;
}

.packages a:hover {
    text-decoration: underline;
}
</style>
