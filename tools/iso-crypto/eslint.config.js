import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        rules: {
            // Elliptic curve math, where a point's parity is its lowest bit
            'no-bitwise': 'off',
        },
    },
];
