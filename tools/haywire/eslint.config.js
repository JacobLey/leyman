import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...(await configGenerator({ configUrl: import.meta.url, packageJson })),
    {
        rules: {
            'jsdoc/require-template-description': 'off',
        },
    },
];
