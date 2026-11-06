import type { ResolutionKind } from '@arethetypeswrong/core';
import { checkPackage as attw, createPackageFromTarballData } from '@arethetypeswrong/core';
import { problemAffectsResolutionKind, problemKindInfo } from '@arethetypeswrong/core/problems';

/**
 * Which module resolutions a package must work under, with the names Are The Types Wrong's CLI
 * gives them: `strict` is all of them, `node16` drops `node10`, and `esm-only` also drops CommonJS.
 */
export const profiles = {
    strict: ['node10', 'node16-cjs', 'node16-esm', 'bundler'],
    node16: ['node16-cjs', 'node16-esm', 'bundler'],
    'esm-only': ['node16-esm', 'bundler'],
} as const satisfies Record<string, readonly ResolutionKind[]>;
export type Profile = keyof typeof profiles;

/**
 * Checks with Are The Types Wrong that every entry point of the tarball resolves to JavaScript and
 * types under each resolution of the profile.
 *
 * @param tarball - the packed package
 * @param profile - the resolutions to check
 * @returns each problem found
 */
export const typesResolutionProblems = async (
    tarball: Uint8Array,
    profile: Profile
): Promise<string[]> => {
    const analysis = await attw(createPackageFromTarballData(tarball));
    if (analysis.types === false) {
        return ['attw: the package has no types'];
    }
    const kinds: readonly ResolutionKind[] = profiles[profile];
    return analysis.problems
        .map(problem => ({
            affected: kinds.filter(kind => problemAffectsResolutionKind(problem, kind, analysis)),
            problem,
        }))
        .filter(({ affected }) => affected.length > 0)
        .map(({ affected, problem }) => {
            const where = 'entrypoint' in problem ? ` "${problem.entrypoint}"` : '';
            const { emoji, description, docsUrl } = problemKindInfo[problem.kind];
            return `attw${where} (${affected.join(', ')}): ${emoji} ${description} ${docsUrl}`;
        });
};
