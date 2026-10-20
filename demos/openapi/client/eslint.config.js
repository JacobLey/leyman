import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        languageOptions: {
            globals: {
                fetch: 'readonly',
                Headers: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
            },
        },
    },
];
