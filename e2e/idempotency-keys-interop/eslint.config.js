import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        // An entry point the tests spawn, not a module anyone imports
        files: ['test/server/**'],
        rules: {
            // Configured through the environment, as the Go server is
            'n/no-process-env': 'off',
            // Nothing waits on an entry point
            'n/no-top-level-await': 'off',
        },
    },
];
