import AjvDefault from 'ajv/dist/2020.js';
import { defaultImport } from 'default-import';
import { identifier } from 'haywire';
import { enumSchema, objectSchema, type SchemaType, stringSchema } from 'juniper';
import type { FindImport } from './dependencies.js';

const Ajv = defaultImport(AjvDefault);

const packageSchema = objectSchema({
    properties: {
        type: enumSchema().enum('module'),
        version: stringSchema(),
    },
});

const modulePackageSchema = packageSchema.required(['type']).toJSON();
const isModulePackage = new Ajv({ strict: true }).compile<SchemaType<typeof modulePackageSchema>>(
    modulePackageSchema
);

const versionedPackageSchema = packageSchema.required(['version']).toJSON();
const isVersionedPackage = new Ajv({ strict: true }).compile<
    SchemaType<typeof versionedPackageSchema>
>(versionedPackageSchema);

export type IsExplicitlyModuleDirectory = (file: string) => Promise<boolean>;
export const isExplicitlyModuleDirectoryId = identifier<IsExplicitlyModuleDirectory>();

export const packageJsonVersionId = identifier<string>().named('package-json-version');

interface IFindPackageJson {
    isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory;
    getPackageJsonVersion: () => Promise<string>;
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

    public async getPackageJsonVersion(): Promise<string> {
        const pkg = await this.#findImport('package.json', {
            cwd: import.meta.url,
        });

        if (pkg && isVersionedPackage(pkg.content)) {
            return pkg.content.version;
        }

        throw new Error('Unable to load package.json');
    }
}
