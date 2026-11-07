import configGenerator from '@leyman/eslint-config';
import juniper from 'juniper/eslint';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, node: true, plugins: [juniper], packageJson }),
    {
        // Projects of their own, each linted by its own config
        ignores: ['go/**', 'vectors/**'],
    },
    {
        rules: {
            // `then` is a JSON Schema keyword (`if`/`then`/`else`), so schemas have it by design
            'unicorn/no-thenable': 'off',
        },
    },
];
