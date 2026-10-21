import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        rules: {
            'jsdoc/require-template-description': 'off',
            // `then` is a JSON Schema keyword (`if`/`then`/`else`), so schemas have it by design
            'unicorn/no-thenable': 'off',
        },
    },
];
