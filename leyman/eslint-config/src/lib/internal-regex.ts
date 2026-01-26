import type { PackageJson } from './package-json-schema.js';
import escapeStringRegexp from 'escape-string-regexp';

const packageRegex = (packageName: string): string => {
    const escaped = escapeStringRegexp(packageName);
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
        for (const [packageName, versionSpecifier] of Object.entries(dependencies ?? {})) {
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
