import AjvDefault from 'ajv/dist/2020.js';
import { defaultImport } from 'default-import';
import { identifier } from 'haywire';
import { enumSchema, objectSchema, type SchemaType, stringSchema } from 'juniper';
import type { FindImport } from './dependencies.js';

const Ajv = defaultImport(AjvDefault);

const modulePackageSchema = objectSchema({
    properties: {
        type: enumSchema().enum('module'),
        version: stringSchema(),
    },
    required: ['type'],
}).toJSON();

const isModulePackage = new Ajv({ strict: true }).compile<SchemaType<typeof modulePackageSchema>>(
    modulePackageSchema
);

export type IsExplicitlyModuleDirectory = (file: string) => Promise<boolean>;
export const isExplicitlyModuleDirectoryId = identifier<IsExplicitlyModuleDirectory>();

interface IFindPackageJson {
    isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory;
}
/**
 * Package for loading the package.json of a given file.
 *
 * Can use this file to determine the "type" of packages by default (module vs commonjs).
 */
export class FindPackageJson implements IFindPackageJson {
    readonly #findImport: FindImport;

    public constructor(findImport: FindImport) {
        this.#findImport = findImport;
    }

    /**
     * Returns true if the given file has a package.json that _explicitly_ sets `"type": "module"`.
     *
     * @param file - filename
     * @returns true if module
     */
    public async isExplicitlyModuleDirectory(file: string): Promise<boolean> {
        const pkg = await this.#findImport('package.json', {
            cwd: file,
        });

        if (pkg) {
            return isModulePackage(pkg.content);
        }

        return false;
    }
}
