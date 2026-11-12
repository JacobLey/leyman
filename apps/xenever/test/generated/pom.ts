import { x } from 'xenever';

/**
 * The type `{http://maven.apache.org/POM/4.0.0}Parent`.
 */
export interface Parent {
    attributes: x.NoProperties;
    children: { groupId?: string; artifactId?: string; version?: string; relativePath?: string };
}
export const Parent = x.complex({
    content: x.all([
        x.element('groupId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('artifactId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('version', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('relativePath', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            default: '../pom.xml',
            minOccurs: 0,
        }),
    ]),
});

/**
 * The type `{http://maven.apache.org/POM/4.0.0}Dependency`.
 */
export interface Dependency {
    attributes: x.NoProperties;
    children: {
        groupId?: string;
        artifactId?: string;
        version?: string;
        type?: string;
        scope?: string;
        optional?: string;
    };
}
export const Dependency = x.complex({
    content: x.all([
        x.element('groupId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('artifactId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('version', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('type', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            default: 'jar',
            minOccurs: 0,
        }),
        x.element('scope', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('optional', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
    ]),
});

/**
 * The type `{http://maven.apache.org/POM/4.0.0}Model`.
 */
export interface Model {
    attributes: { 'child.project.url.inherit.append.path'?: string };
    children: {
        modelVersion?: string;
        parent?: Parent;
        groupId?: string;
        artifactId?: string;
        version?: string;
        packaging?: string;
        modules?: { attributes: x.NoProperties; children: { module?: string[] } };
        properties?: { attributes: x.NoProperties; children: { '#any'?: x.XmlNode[] } };
        dependencies?: { attributes: x.NoProperties; children: { dependency?: Dependency[] } };
    };
}
export const Model = x.complex({
    attributes: [x.attribute('child.project.url.inherit.append.path', x.string())],
    content: x.all([
        x.element('modelVersion', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('parent', Parent, {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('groupId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('artifactId', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('version', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            minOccurs: 0,
        }),
        x.element('packaging', x.string(), {
            namespace: 'http://maven.apache.org/POM/4.0.0',
            default: 'jar',
            minOccurs: 0,
        }),
        x.element(
            'modules',
            x.complex({
                content: x.sequence([
                    x.element('module', x.string(), {
                        namespace: 'http://maven.apache.org/POM/4.0.0',
                        minOccurs: 0,
                        maxOccurs: 'unbounded',
                    }),
                ]),
            }),
            { namespace: 'http://maven.apache.org/POM/4.0.0', minOccurs: 0 }
        ),
        x.element(
            'properties',
            x.complex({
                content: x.sequence([
                    x.any({ processContents: 'skip', minOccurs: 0, maxOccurs: 'unbounded' }),
                ]),
            }),
            { namespace: 'http://maven.apache.org/POM/4.0.0', minOccurs: 0 }
        ),
        x.element(
            'dependencies',
            x.complex({
                content: x.sequence([
                    x.element('dependency', Dependency, {
                        namespace: 'http://maven.apache.org/POM/4.0.0',
                        minOccurs: 0,
                        maxOccurs: 'unbounded',
                    }),
                ]),
            }),
            { namespace: 'http://maven.apache.org/POM/4.0.0', minOccurs: 0 }
        ),
    ]),
});

/**
 * The element `{http://maven.apache.org/POM/4.0.0}project`.
 */
export type Project = Model;
export const project: x.ElementSchema<'project', Project> = x.element('project', Model, {
    namespace: 'http://maven.apache.org/POM/4.0.0',
});
