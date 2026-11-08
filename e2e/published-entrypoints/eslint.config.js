import configGenerator from '@leyman/eslint-config';
import juniper from 'juniper/eslint';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, plugins: [juniper], packageJson }),
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    // No tsconfig, so lint nested scripts like top-level files
                    allowDefaultProject: ['*.js', 'scripts/*.mjs'],
                },
            },
        },
    },
    {
        // A script Nx runs, not a module anyone imports
        files: ['scripts/**'],
        languageOptions: {
            globals: { process: 'readonly' },
        },
        rules: {
            // Plain JS can't declare return types
            '@typescript-eslint/explicit-function-return-type': 'off',
            // Reporting to the terminal is its output
            'no-console': 'off',
            // Dagger passes the Node.js binary to test with through the environment
            'n/no-process-env': 'off',
            // Runs one suite at a time, with nothing else to run concurrently
            'n/no-sync': 'off',
        },
    },
];
