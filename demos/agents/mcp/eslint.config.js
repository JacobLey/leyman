import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        languageOptions: {
            globals: {
                btoa: 'readonly',
                fetch: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
            },
        },
    },
];
