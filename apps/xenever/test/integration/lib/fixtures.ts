import type { DirectoryResult } from 'tmp-promise';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

/**
 * An XSD that includes `common.xsd`.
 */
export const mainXsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="common.xsd"/>
  <xs:element name="order">
    <xs:complexType>
      <xs:sequence><xs:element name="id" type="Id"/><xs:element name="count" type="xs:integer"/></xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
`;

/**
 * The XSD `mainXsd` includes.
 */
export const commonXsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="Id"><xs:restriction base="xs:token"/></xs:simpleType>
</xs:schema>
`;

export interface TmpDirContext {
    readonly tmpDir: DirectoryResult;
    readonly resolve: (path: string) => string;
    readonly write: (path: string, text: string) => Promise<void>;
    readonly read: (path: string) => Promise<string>;
    /**
     * Replaces the first occurrence of a text in a file.
     */
    readonly edit: (path: string, search: string, replacement: string) => Promise<void>;
}

/**
 * Creates a temporary directory holding `main.xsd` and `common.xsd`, with helpers to write and read files in it.
 * For a `beforeEach` hook, paired with `tmpDir.cleanup()` in `afterEach`.
 *
 * @returns test context
 */
export const createTmpDir = async (): Promise<TmpDirContext> => {
    const tmpDir = await dir({ prefix: 'xenever-', unsafeCleanup: true });
    const resolve = (path: string): string => Path.join(tmpDir.path, path);
    const write = async (path: string, text: string): Promise<void> => {
        await mkdir(Path.dirname(resolve(path)), { recursive: true });
        await writeFile(resolve(path), text);
    };
    await Promise.all([write('main.xsd', mainXsd), write('common.xsd', commonXsd)]);
    const read = async (path: string): Promise<string> => readFile(resolve(path), 'utf8');
    const edit = async (path: string, search: string, replacement: string): Promise<void> => {
        const text = await read(path);
        await write(
            path,
            text.replace(search, () => replacement)
        );
    };
    return { tmpDir, resolve, write, read, edit };
};
