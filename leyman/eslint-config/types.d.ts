// eslint-disable-next-line import-x/unambiguous -- Ambient declarations, so not a module
declare module '@eslint/js' {
    const configs: {
        all: {
            // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- An import at the top would make this file a module, and these declarations local to it
            rules: import('eslint').Linter.RulesRecord;
        };
        recommended: {
            // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- An import at the top would make this file a module, and these declarations local to it
            rules: import('eslint').Linter.RulesRecord;
        };
    };
    export default { configs };
}

declare module 'eslint-config-prettier' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- An import at the top would make this file a module, and these declarations local to it
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-jsx-a11y' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- An import at the top would make this file a module, and these declarations local to it
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-react-hooks' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- An import at the top would make this file a module, and these declarations local to it
    export default import('eslint').ESLint.Plugin;
}

declare module 'eslint-plugin-sonarjs' {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- An import at the top would make this file a module, and these declarations local to it
    export default import('eslint').ESLint.Plugin;
}
