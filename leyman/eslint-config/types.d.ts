// eslint-disable-next-line import/unambiguous
declare module '@eslint/js' {
    const configs: {
        all: {
            // eslint-disable-next-line @typescript-eslint/consistent-type-imports
            rules: import('eslint').Linter.RulesRecord;
        };
        recommended: {
            // eslint-disable-next-line @typescript-eslint/consistent-type-imports
            rules: import('eslint').Linter.RulesRecord;
        };
    };
    export default { configs };
}

declare module 'eslint-config-prettier' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-import' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-jsx-a11y' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-react-hooks' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-sonarjs' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    export default import('eslint').ESLint.Plugin;
}
