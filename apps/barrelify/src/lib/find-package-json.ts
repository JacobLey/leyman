import type { SchemaType } from 'juniper';
import type { FindImport } from './dependencies.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { identifier } from 'haywire';
import { enumSchema, objectSchema, stringSchema } from 'juniper';

const modulePackageSchema = objectSchema({
    properties: {
        type: enumSchema().enum('module'),
        version: stringSchema(),
    },
    required: ['type'],
}).toJSON();

const isModulePackage = new Ajv2020({ strict: true }).compile<
    SchemaType<typeof modulePackageSchema>
>(modulePackageSchema);
/**
 * Returns true if the given file has a package.json that _explicitly_ sets `"type": "module"`.
 *
 * @param file - filename
 * @returns true if module
 */
export type IsExplicitlyModuleDirectory = (file: string) => Promise<boolean>;
export const isExplicitlyModuleDirectoryId = identifier<IsExplicitlyModuleDirectory>();

/**
 * Package for loading the package.json of a given file.
 *
 * Can use this file to determine the "type" of packages by default (module vs commonjs).
 */
export class FindPackageJson {
    readonly #findImport: FindImport;

    public readonly isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory;

    public constructor(findImport: FindImport) {
        this.#findImport = findImport;

        this.isExplicitlyModuleDirectory = this.#isExplicitlyModuleDirectory.bind(this);
    }

    async #isExplicitlyModuleDirectory(file: string): Promise<boolean> {
        const pkg = await this.#findImport('package.json', {
            cwd: file,
        });

        if (pkg) {
            return isModulePackage(pkg.content);
        }

        return false;
    }
}
