import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...(await configGenerator({ configUrl: import.meta.url, packageJson })),
    {
        rules: {
            // RFC 3492's algorithm, on UTF-16 code units
            'no-bitwise': 'off',
        },
    },
];
