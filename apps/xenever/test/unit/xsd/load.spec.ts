import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import {
    parse,
    XeneverInvalidSchemaError,
    XeneverLoadError,
    XeneverUnsupportedError,
} from 'xenever';
import { loadXsd } from 'xenever/xsd';
import { expectSchemaError, loadFiles, loadSchema, mainPath, schema } from './helpers.js';

const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';

suite('loadXsd files', () => {
    suite('From the file system', () => {
        test('Loads a Maven POM slice and parses a POM', async () => {
            const pomSchema = await loadXsd('test/data/pom/maven-4.0.0.xsd');
            const [project] = pomSchema.elements;
            expect(pomSchema.types.map(({ name }) => name)).to.deep.equal([
                'Model',
                'Parent',
                'Dependency',
            ]);
            const pom = parse(await readFile('test/data/pom/pom.xml', 'utf8'), project!);
            const { attributes, children } = pom as {
                readonly attributes: Readonly<Record<string, unknown>>;
                readonly children: Readonly<Record<string, unknown>>;
            };
            expect(attributes).to.deep.equal({});
            expect(children).to.deep.include({
                modelVersion: '4.0.0',
                artifactId: 'app',
                parent: {
                    attributes: {},
                    children: {
                        groupId: 'org.example',
                        artifactId: 'parent',
                        version: '1.0',
                        relativePath: '../pom.xml',
                    },
                },
                dependencies: {
                    attributes: {},
                    children: {
                        dependency: [
                            {
                                attributes: {},
                                children: {
                                    groupId: 'junit',
                                    artifactId: 'junit',
                                    version: '4.13.2',
                                    scope: 'test',
                                },
                            },
                            {
                                attributes: {},
                                children: {
                                    groupId: 'org.slf4j',
                                    artifactId: 'slf4j-api',
                                    type: 'pom',
                                },
                            },
                        ],
                    },
                },
            });
            const { properties } = children as {
                readonly properties: {
                    readonly children: Readonly<Record<string, readonly unknown[]>>;
                };
            };
            expect(
                properties.children['#any']!.map(node => (node as { localName: string }).localName)
            ).to.deep.equal(['java.version', 'encoding']);
        });

        test('Follows includes and imports, circular ones included, each file once', async () => {
            const read: string[] = [];
            const { elements, types } = await loadXsd('test/data/linked/main.xsd', {
                onRead: path => {
                    read.push(Path.relative(process.cwd(), path));
                },
            });
            expect(read).to.deep.equal([
                'test/data/linked/main.xsd',
                'test/data/linked/common.xsd',
                'test/data/linked/other/other.xsd',
            ]);
            expect(elements.map(({ name, namespace }) => [name, namespace])).to.deep.equal([
                ['order', 'urn:main'],
                ['note', 'urn:other'],
            ]);
            expect(types.map(({ name }) => name)).to.deep.equal(['Id']);
            expect(
                parse(
                    '<order xmlns="urn:main"><id> a1 </id><note xmlns="urn:other">b</note></order>',
                    elements[0]!
                )
            ).to.deep.equal({ attributes: {}, children: { id: 'a1', note: 'b' } });
        });

        test('Rejects a missing file', async () => {
            const error = (await expect(loadXsd('test/data/missing.xsd')).to.be.rejectedWith(
                XeneverLoadError,
                /^Could not read the schema \(at .*missing\.xsd\)$/v
            )) as unknown as XeneverLoadError;
            expect(error).to.have.property('cause').that.is.instanceOf(Error);
        });
    });

    suite('Includes and imports', () => {
        test('Resolve relative to the including file, and use the catalog first', async () => {
            const { elements } = await loadFiles(
                {
                    [mainPath]: schema(
                        `<xs:include schemaLocation="parts/a.xsd"/>
                        <xs:import namespace="urn:b" schemaLocation="https://example.com/b.xsd"/>
                        <xs:import namespace="urn:c"/>`,
                        'targetNamespace="urn:t"'
                    ),
                    '/schemas/parts/a.xsd': schema(
                        '<xs:element name="a" type="xs:int"/>',
                        'targetNamespace="urn:t"'
                    ),
                    '/local/b.xsd': schema('<xs:element name="b"/>', 'targetNamespace="urn:b"'),
                    '/local/c.xsd': schema('<xs:element name="c"/>', 'targetNamespace="urn:c"'),
                },
                {
                    catalog: {
                        'https://example.com/b.xsd': '/local/b.xsd',
                        'urn:c': '/local/c.xsd',
                    },
                }
            );
            expect(elements.map(({ name }) => name)).to.deep.equal(['a', 'b', 'c']);
        });

        test('An import without a location or catalog entry only declares the namespace', async () => {
            const { elements } = await loadSchema(
                `<xs:import namespace="urn:x"/><xs:import/>
                <xs:element name="e"><xs:complexType><xs:sequence><xs:any namespace="urn:x"/></xs:sequence></xs:complexType></xs:element>`,
                'targetNamespace="urn:t"'
            );
            expect(elements).to.have.length(1);
        });

        test('XML Schema and XML namespace imports need no file; the catalog may map xml.xsd', async () => {
            const { elements } = await loadFiles(
                {
                    [mainPath]: schema(
                        `<xs:import namespace="http://www.w3.org/2001/XMLSchema" schemaLocation="https://www.w3.org/2001/XMLSchema.xsd"/>
                        <xs:import namespace="${xmlNamespace}" schemaLocation="xml.xsd"/>
                        <xs:element name="e"><xs:complexType><xs:attribute ref="xml:lang"/></xs:complexType></xs:element>`
                    ),
                    '/xml.xsd': schema(
                        '<xs:attribute name="lang" type="xs:token"/>',
                        `targetNamespace="${xmlNamespace}"`
                    ),
                },
                { catalog: { [xmlNamespace]: '/xml.xsd' } }
            );
            expect(elements[0]!.type).to.deep.equal({
                kind: 'complex',
                attributes: [
                    {
                        kind: 'attribute',
                        name: 'lang',
                        namespace: xmlNamespace,
                        type: { kind: 'token' },
                    },
                ],
            });
        });

        test('A remote location without a catalog entry is a load error', async () => {
            await expect(
                loadSchema('<xs:include schemaLocation="https://example.com/a.xsd"/>')
            ).to.be.rejectedWith(
                XeneverLoadError,
                /^The schema at \/xs:schema\/xs:include in \/schemas\/main\.xsd, line 1 is not a local file; map its location to one with the `catalog` option \(at https:\/\/example\.com\/a\.xsd\)$/v
            );
        });

        test('An unreadable include names where it is included', async () => {
            await expect(loadSchema('<xs:include schemaLocation="gone.xsd"/>')).to.be.rejectedWith(
                XeneverLoadError,
                /^Could not read the schema, included at \/xs:schema\/xs:include in \/schemas\/main\.xsd, line 1 \(at \/schemas\/gone\.xsd\)$/v
            );
        });

        test('An included file must target the same namespace', async () => {
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema(
                        '<xs:include schemaLocation="a.xsd"/>',
                        'targetNamespace="urn:t"'
                    ),
                    '/schemas/a.xsd': schema('', 'targetNamespace="urn:u"'),
                }),
                XeneverInvalidSchemaError,
                /The included schema targets `urn:u`, not `urn:t`/v,
                { filePath: mainPath, path: '/xs:schema/xs:include', line: 1 }
            );
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema('<xs:include schemaLocation="a.xsd"/>'),
                    '/schemas/a.xsd': schema('', 'targetNamespace="urn:u"'),
                }),
                XeneverInvalidSchemaError,
                /targets `urn:u`, not no namespace/v
            );
        });

        test('A chameleon include is not supported', async () => {
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema(
                        '<xs:include schemaLocation="a.xsd"/>',
                        'targetNamespace="urn:t"'
                    ),
                    '/schemas/a.xsd': schema(''),
                }),
                XeneverUnsupportedError,
                /chameleon include/v
            );
        });

        test('An imported file must target the imported namespace, also when already loaded', async () => {
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema(
                        '<xs:import namespace="urn:a" schemaLocation="a.xsd"/>',
                        'targetNamespace="urn:t"'
                    ),
                    '/schemas/a.xsd': schema(
                        '<xs:import namespace="urn:x" schemaLocation="main.xsd"/>',
                        'targetNamespace="urn:a"'
                    ),
                }),
                XeneverInvalidSchemaError,
                /The imported schema targets `urn:t`, not `urn:x`/v,
                { filePath: '/schemas/a.xsd' }
            );
        });

        test('Imports name another namespace than the target, and not an empty one', async () => {
            await expectSchemaError(
                loadSchema('<xs:import namespace="urn:t"/>', 'targetNamespace="urn:t"'),
                XeneverInvalidSchemaError,
                /can not import its own target namespace, `urn:t`/v
            );
            await expectSchemaError(
                loadSchema('<xs:import/>'),
                XeneverInvalidSchemaError,
                /its own target namespace, no namespace/v
            );
            await expectSchemaError(
                loadSchema('<xs:import namespace=""/>'),
                XeneverInvalidSchemaError,
                /An imported namespace must not be empty/v
            );
        });

        test('Includes need a location', async () => {
            await expectSchemaError(
                loadSchema('<xs:include/>'),
                XeneverInvalidSchemaError,
                /`xs:include` is missing the attribute `schemaLocation`/v
            );
        });
    });

    suite('Schema documents', () => {
        test('Must be well-formed XML', async () => {
            await expectSchemaError(
                loadFiles({ [mainPath]: '<xs:schema' }),
                XeneverInvalidSchemaError,
                /^The schema is not well-formed XML: /v,
                { filePath: mainPath, line: 1 }
            );
        });

        test('Have an xs:schema root', async () => {
            await expectSchemaError(
                loadFiles({ [mainPath]: '<schema/>' }),
                XeneverInvalidSchemaError,
                /The root element of an XSD is `xs:schema`/v,
                { path: '/schema' }
            );
            await expectSchemaError(
                loadFiles({
                    [mainPath]: '<xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
                }),
                XeneverInvalidSchemaError,
                /The root element of an XSD is `xs:schema`/v
            );
        });

        test('Check their attributes', async () => {
            await expectSchemaError(
                loadSchema('', 'targetNamespace=""'),
                XeneverInvalidSchemaError,
                /A target namespace must not be empty/v
            );
            await expectSchemaError(
                loadSchema('', 'elementFormDefault="yes"'),
                XeneverInvalidSchemaError,
                /`elementFormDefault` must be `qualified` or `unqualified`/v
            );
            await expectSchemaError(
                loadSchema('', 'blockDefault="list"'),
                XeneverInvalidSchemaError,
                /`blockDefault` must be `#all` or a list of `extension`, `restriction` and `substitution`/v
            );
            await expectSchemaError(
                loadSchema('', 'finalDefault="substitution"'),
                XeneverInvalidSchemaError,
                /`finalDefault` must be/v
            );
            const { elements } = await loadSchema(
                '<xs:element name="a"/>',
                'blockDefault="#all" finalDefault="" version="1" id="s"'
            );
            expect(elements).to.have.length(1);
        });

        test('Take ids only from XSD elements, not from documentation', async () => {
            const { elements } = await loadSchema(
                '<xs:annotation><xs:documentation><xs:element id="s"/></xs:documentation></xs:annotation><xs:element name="a" id="s"/>'
            );
            expect(elements).to.have.length(1);
        });

        test('Check `xml:lang` on XSD elements, not in documentation', async () => {
            const { elements } = await loadSchema(
                `<xs:annotation><xs:documentation xml:lang="en-US"><p xml:lang="not a language"/></xs:documentation></xs:annotation>
                <xs:element name="a" xml:lang=""><xs:annotation><xs:documentation xml:lang=" en "/></xs:annotation></xs:element>`,
                'xml:lang="EN"'
            );
            expect(elements).to.have.length(1);
            await expectSchemaError(
                loadSchema('', 'xml:lang="en_US"'),
                XeneverInvalidSchemaError,
                /"en_US" is not a valid `xml:lang`/v
            );
        });

        test('Put includes and imports first', async () => {
            await expectSchemaError(
                loadSchema('<xs:element name="a"/><xs:import namespace="urn:x"/>'),
                XeneverInvalidSchemaError,
                /`xs:import` is not allowed here in `xs:schema`/v
            );
        });

        test('Name every global component once', async () => {
            await expectSchemaError(
                loadSchema('<xs:element type="xs:string"/>'),
                XeneverInvalidSchemaError,
                /A global component has a `name`/v
            );
            await expectSchemaError(
                loadSchema('<xs:group name="1a"><xs:sequence/></xs:group>'),
                XeneverInvalidSchemaError,
                /"1a" is not an NCName/v
            );
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema(
                        '<xs:include schemaLocation="a.xsd"/><xs:simpleType name="T"><xs:restriction base="xs:int"/></xs:simpleType>',
                        'targetNamespace="urn:t"'
                    ),
                    '/schemas/a.xsd': schema(
                        '<xs:complexType name="T"/>',
                        'targetNamespace="urn:t"'
                    ),
                }),
                XeneverInvalidSchemaError,
                /^\{urn:t\}T is already defined \(at \/xs:schema\/xs:simpleType in \/schemas\/main\.xsd, line 1\)/v,
                { filePath: '/schemas/a.xsd' }
            );
            const { elements, types } = await loadSchema(
                '<xs:element name="a"/><xs:complexType name="a"/><xs:attribute name="a"/><xs:group name="a"><xs:sequence/></xs:group><xs:attributeGroup name="a"/>'
            );
            expect([elements.length, types.length]).to.deep.equal([1, 1]);
        });
    });

    suite('`ordered`', () => {
        test('Names a complex type or global element with an anonymous complex type', async () => {
            const body = `<xs:simpleType name="S"><xs:restriction base="xs:string"/></xs:simpleType>
                <xs:element name="named" type="S"/>
                <xs:complexType name="Empty"/>`;
            await expect(loadSchema(body, '', { ordered: ['missing'] })).to.be.rejectedWith(
                TypeError,
                '`ordered` names "missing", which is neither a type nor a global element'
            );
            await expect(loadSchema(body, '', { ordered: ['S'] })).to.be.rejectedWith(
                TypeError,
                '`ordered` names "S", a simple type'
            );
            await expect(loadSchema(body, '', { ordered: ['named'] })).to.be.rejectedWith(
                TypeError,
                '`ordered` names the element "named", whose type is not an anonymous complex type; name its type instead'
            );
            await expect(loadSchema(body, '', { ordered: ['Empty'] })).to.be.rejectedWith(
                TypeError,
                '`ordered` names "Empty", whose type has no child elements to order'
            );
        });
    });

    suite('Entry points', () => {
        test('The main entry never imports the loader', async () => {
            const root = Path.resolve('dist');
            const seen = new Set<string>();
            const visit = async (file: string): Promise<void> => {
                if (seen.has(file)) {
                    return;
                }
                seen.add(file);
                const text = await readFile(file, 'utf8');
                for (const match of text.matchAll(/from '(?<specifier>[^']+)'/gv)) {
                    const { specifier } = match.groups as { readonly specifier: string };
                    if (specifier.startsWith('.')) {
                        await visit(Path.resolve(Path.dirname(file), specifier));
                    } else if (specifier.startsWith('#internal/')) {
                        await visit(Path.join(root, specifier.slice('#internal/'.length)));
                    }
                }
            };
            await visit(Path.join(root, 'index.js'));
            const reached = [...seen].map(file => Path.relative(root, file));
            expect(reached).to.include('lib/parse.js');
            expect(reached.filter(file => file.startsWith('lib/xsd/'))).to.deep.equal([]);
        });
    });
});
