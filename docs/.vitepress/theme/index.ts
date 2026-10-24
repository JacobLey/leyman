import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import type { EnhanceAppContext } from 'vitepress';
import Theme from 'vitepress/theme';
import CategoryCards from './components/CategoryCards.vue';
import DemoCards from './components/DemoCards.vue';
import InfrastructureCards from './components/InfrastructureCards.vue';
import PackageCards from './components/PackageCards.vue';
import ProjectHeader from './components/ProjectHeader.vue';
import ProjectRelated from './components/ProjectRelated.vue';

import '@shikijs/vitepress-twoslash/style.css';

export default {
    extends: Theme,
    enhanceApp({ app }: EnhanceAppContext) {
        app.use(TwoslashFloatingVue);
        app.component('CategoryCards', CategoryCards);
        app.component('DemoCards', DemoCards);
        app.component('InfrastructureCards', InfrastructureCards);
        app.component('PackageCards', PackageCards);
        app.component('ProjectHeader', ProjectHeader);
        app.component('ProjectRelated', ProjectRelated);
    },
};
