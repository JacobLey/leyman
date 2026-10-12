import type { PackageJson } from './package-json-schema.js';

const packageRegex = (packageName: string): string => {
    const escaped = RegExp.escape(packageName);
    // Either the package name standalone, or with extra export path.
    return `${escaped}(?:$|/)`;
};

export const getInternalRegex = (packageJson: PackageJson): RegExp => {
    const internalPackages = new Set([packageJson.name]);

    for (const dependencies of [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.optionalDependencies,
        packageJson.peerDependencies,
    ]) {
        if (!dependencies) {
            continue;
        }
        for (const [packageName, versionSpecifier] of Object.entries(dependencies)) {
            if (versionSpecifier.startsWith('workspace:')) {
                internalPackages.add(packageName);
            }
        }
    }

    const packageRegexUnion = [...internalPackages]
        .toSorted((a, b) => a.localeCompare(b, 'en'))
        .map(packageName => packageRegex(packageName))
        .join('|');

    return new RegExp(`^(?:${packageRegexUnion})`, 'u');
};
