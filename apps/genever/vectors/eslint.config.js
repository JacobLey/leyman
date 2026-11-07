import configGenerator from '@leyman/eslint-config';
import juniper from 'juniper/eslint';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, plugins: [juniper], packageJson }),
    {
        files: ['src/error-schemas.ts', 'src/juniper-schemas.ts', 'src/openapi-schemas.ts'],
        rules: {
            // Fixtures are data: each bound is only there to show up in the schema
            '@typescript-eslint/no-magic-numbers': 'off',
            // `then` is a JSON Schema keyword (`if`/`then`/`else`), so schemas have it by design
            'unicorn/no-thenable': 'off',
        },
    },
];
