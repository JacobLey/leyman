import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        languageOptions: {
            globals: {
                btoa: 'readonly',
                Buffer: 'readonly',
                fetch: 'readonly',
                process: 'readonly',
                Response: 'readonly',
                TextEncoder: 'readonly',
                URL: 'readonly',
            },
        },
    },
];
