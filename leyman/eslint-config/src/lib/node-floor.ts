/* eslint-disable @typescript-eslint/no-magic-numbers -- Node.js major versions */

import type { Linter } from 'eslint';
import type { PackageJson } from './package-json-schema.js';

/**
 * Rules that suggest a newer API, keyed by the first Node.js major version that has it.
 * `null` means no release has it yet, or TypeScript's lib doesn't declare it, so a call can't type-check.
 */
const apiRules: Readonly<Record<string, number | null>> = {
    'unicorn/prefer-error-is-error': 24,
    // In Node.js 26, but not in TypeScript's lib
    'unicorn/prefer-iterator-concat': null,
    'unicorn/prefer-iterator-zip': null,
    'unicorn/prefer-promise-try': 23,
    'unicorn/prefer-regexp-escape': 24,
    'unicorn/prefer-uint8array-base64': 25,
    'unicorn/prefer-uint8array-hex': 25,
};

/**
 * The Node.js versions a package supports: its `engines.node`, or from the running version on when there is none, as
 * private packages run on the toolchain only. Both the rules below and eslint-plugin-n (`settings.n.version`) read it,
 * so they agree on the floor.
 *
 * @param packageJson - Loaded `package.json` file
 * @returns A semver range starting with `>=`
 * @throws {Error} when `engines.node` doesn't start with `>=`
 */
export const getNodeRange = (packageJson: PackageJson): string => {
    const range = packageJson.engines?.node;
    if (range === undefined) {
        return `>=${process.versions.node}`;
    }
    if (!/^>=\s*\d/v.test(range)) {
        throw new Error(`engines.node must be ">=<version>" to name a floor, not "${range}"`);
    }
    return range;
};

/**
 * The oldest Node.js major version a package supports: the major version of its range (`>=22`, `>=24.1.0`...).
 *
 * @param packageJson - Loaded `package.json` file
 * @returns Node.js major version
 * @throws {Error} when `engines.node` doesn't start with `>=`
 */
export const getNodeFloor = (packageJson: PackageJson): number =>
    Number(/^>=\s*(?<major>\d+)/v.exec(getNodeRange(packageJson))!.groups!.major);

/**
 * Turns off each rule that suggests an API the package's oldest supported Node.js doesn't have.
 *
 * @param packageJson - Loaded `package.json` file
 * @returns The rules to turn off
 */
export const nodeFloorRules = (packageJson: PackageJson): Linter.RulesRecord => {
    const floor = getNodeFloor(packageJson);
    const rules: Linter.RulesRecord = {};
    for (const [rule, since] of Object.entries(apiRules)) {
        if (since === null || since > floor) {
            rules[rule] = 'off';
        }
    }
    return rules;
};
