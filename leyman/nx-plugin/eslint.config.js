import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default [
    ...configGenerator({ configUrl: import.meta.url, node: true, packageJson }),
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    // Bins run without a build, so they are plain JS outside the tsconfig
                    allowDefaultProject: ['*.js', 'scripts/*.mjs'],
                },
            },
        },
    },
    {
        // Bins that Nx runs per project, not modules anyone imports
        files: ['scripts/**'],
        rules: {
            // Plain JS can't declare return types
            '@typescript-eslint/explicit-function-return-type': 'off',
            // Nx passes its context (e.g. `NX_WORKSPACE_ROOT`) through the environment
            'n/no-process-env': 'off',
            // Entry points, so nothing waits on them
            'n/no-top-level-await': 'off',
            // Sequential work, with nothing else to run concurrently
            'n/no-sync': 'off',
        },
    },
];
