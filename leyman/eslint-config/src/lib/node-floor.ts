/* eslint-disable @typescript-eslint/no-magic-numbers -- Node.js major versions */

import type { Linter } from 'eslint';
import type { PackageJson } from './package-json-schema.js';

/**
 * Rules that suggest a newer API, keyed by the first Node.js major version that has it.
 * `null` means no release has it yet.
 */
const apiRules: Readonly<Record<string, number | null>> = {
    'unicorn/prefer-error-is-error': 24,
    'unicorn/prefer-iterator-concat': 26,
    'unicorn/prefer-iterator-zip': null,
    'unicorn/prefer-promise-try': 23,
    'unicorn/prefer-regexp-escape': 24,
    'unicorn/prefer-uint8array-base64': 25,
    'unicorn/prefer-uint8array-hex': 25,
};

/**
 * The oldest Node.js major version a package supports: the major version of `engines.node` (`>=22`, `>=24.1.0`...),
 * or the running version's when there is none, as private packages run on the toolchain only.
 *
 * @param packageJson - Loaded `package.json` file
 * @returns Node.js major version
 * @throws {Error} when `engines.node` doesn't start with `>=`
 */
export const getNodeFloor = (packageJson: PackageJson): number => {
    const range = packageJson.engines?.node;
    if (range === undefined) {
        return Number(process.versions.node.split('.', 1)[0]);
    }
    const major = /^>=\s*(?<major>\d+)/v.exec(range)?.groups?.major;
    if (major === undefined) {
        throw new Error(`engines.node must be ">=<version>" to name a floor, not "${range}"`);
    }
    return Number(major);
};

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
