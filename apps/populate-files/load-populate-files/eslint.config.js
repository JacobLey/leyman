import configGenerator from '@leyman/eslint-config';
import juniper from 'juniper/eslint';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({
    configUrl: import.meta.url,
    node: true,
    plugins: [juniper],
    packageJson,
});
