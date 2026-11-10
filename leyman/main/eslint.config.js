import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

// Past the 8 typescript-eslint allows by default, and each is small
const maxScriptsLinted = 16;

export default [
    ...(await configGenerator({ configUrl: import.meta.url, node: true, packageJson })),
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    // No tsconfig, so lint nested scripts like top-level files
                    allowDefaultProject: ['*.js', 'scripts/*.mjs'],
                    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING:
                        maxScriptsLinted,
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
            // Same reason, for what the Nx plugin exports
            '@typescript-eslint/explicit-module-boundary-types': 'off',
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
