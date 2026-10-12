import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, packageJson }),
    {
        languageOptions: {
            globals: {
                process: 'readonly',
            },
            parserOptions: {
                projectService: {
                    // No tsconfig, so lint nested scripts like top-level files
                    allowDefaultProject: ['*.js', 'scripts/*.mjs'],
                },
            },
        },
    },
    {
        // One-shot scripts that Nx runs per project, not modules anyone imports
        files: ['scripts/**'],
        rules: {
            // Plain JS can't declare return types
            '@typescript-eslint/explicit-function-return-type': 'off',
            // Reporting to the terminal is their output
            'no-console': 'off',
            // Nx passes its context (e.g. `NX_WORKSPACE_ROOT`) through the environment
            'n/no-process-env': 'off',
            // Entry points, so nothing waits on them
            'n/no-top-level-await': 'off',
            // Sequential work, with nothing else to run concurrently
            'n/no-sync': 'off',
        },
    },
];
