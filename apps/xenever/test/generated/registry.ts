import { x } from 'xenever';

/**
 * The type `{urn:example:registry}Code`.
 */
export type Code = string;
export const Code = x.token({ pattern: '[A-Z]{2}' });

/**
 * The element `{urn:example:registry}registry`.
 */
export type Registry = {
    attributes: x.NoProperties;
    children: {
        state: {
            attributes: x.NoProperties;
            children: { code: Code; vehicle?: { attributes: { plate: number; state: Code } }[] };
        }[];
        person?: {
            attributes: x.NoProperties;
            children: { car?: { attributes: { state: Code; plate: number } }[] };
        }[];
    };
};
export const registry: x.ElementSchema<'registry', Registry> = x.element(
    'registry',
    x.complex({
        content: x.sequence([
            x.element(
                'state',
                x.complex({
                    content: x.sequence([
                        x.element('code', Code, { namespace: 'urn:example:registry' }),
                        x.element(
                            'vehicle',
                            x.complex({
                                attributes: [
                                    x.attribute('plate', x.integer(), { use: 'required' }),
                                    x.attribute('state', Code, { use: 'required' }),
                                ],
                            }),
                            {
                                namespace: 'urn:example:registry',
                                minOccurs: 0,
                                maxOccurs: 'unbounded',
                            }
                        ),
                    ]),
                }),
                {
                    namespace: 'urn:example:registry',
                    identity: [
                        x.unique('plate', 'r:vehicle', ['@plate'], {
                            namespace: 'urn:example:registry',
                            namespaces: { r: 'urn:example:registry' },
                        }),
                    ],
                    maxOccurs: 'unbounded',
                }
            ),
            x.element(
                'person',
                x.complex({
                    content: x.sequence([
                        x.element(
                            'car',
                            x.complex({
                                attributes: [
                                    x.attribute('state', Code, { use: 'required' }),
                                    x.attribute('plate', x.integer(), { use: 'required' }),
                                ],
                            }),
                            {
                                namespace: 'urn:example:registry',
                                minOccurs: 0,
                                maxOccurs: 'unbounded',
                            }
                        ),
                    ]),
                }),
                { namespace: 'urn:example:registry', minOccurs: 0, maxOccurs: 'unbounded' }
            ),
        ]),
    }),
    {
        namespace: 'urn:example:registry',
        identity: [
            x.key('state', 'r:state', ['r:code'], {
                namespace: 'urn:example:registry',
                namespaces: { r: 'urn:example:registry' },
            }),
            x.keyref(
                'vehicleState',
                { name: 'state', namespace: 'urn:example:registry' },
                './/r:vehicle',
                ['@state'],
                { namespace: 'urn:example:registry', namespaces: { r: 'urn:example:registry' } }
            ),
            x.key('registration', './/r:vehicle', ['@state', '@plate'], {
                namespace: 'urn:example:registry',
                namespaces: { r: 'urn:example:registry' },
            }),
            x.keyref(
                'car',
                { name: 'registration', namespace: 'urn:example:registry' },
                'r:person/r:car',
                ['@state', '@plate'],
                { namespace: 'urn:example:registry', namespaces: { r: 'urn:example:registry' } }
            ),
        ],
    }
);

/**
 * The element `{urn:example:registry}state`.
 */
export type State = {
    attributes: x.NoProperties;
    children: { code: Code; vehicle?: { attributes: { plate: number; state: Code } }[] };
};
export const state: x.ElementSchema<'state', State> = x.element(
    'state',
    x.complex({
        content: x.sequence([
            x.element('code', Code, { namespace: 'urn:example:registry' }),
            x.element(
                'vehicle',
                x.complex({
                    attributes: [
                        x.attribute('plate', x.integer(), { use: 'required' }),
                        x.attribute('state', Code, { use: 'required' }),
                    ],
                }),
                { namespace: 'urn:example:registry', minOccurs: 0, maxOccurs: 'unbounded' }
            ),
        ]),
    }),
    {
        namespace: 'urn:example:registry',
        identity: [
            x.unique('plate', 'r:vehicle', ['@plate'], {
                namespace: 'urn:example:registry',
                namespaces: { r: 'urn:example:registry' },
            }),
        ],
    }
);

/**
 * The element `{urn:example:registry}vehicle`.
 */
export type Vehicle = { attributes: { plate: number; state: Code } };
export const vehicle: x.ElementSchema<'vehicle', Vehicle> = x.element(
    'vehicle',
    x.complex({
        attributes: [
            x.attribute('plate', x.integer(), { use: 'required' }),
            x.attribute('state', Code, { use: 'required' }),
        ],
    }),
    { namespace: 'urn:example:registry' }
);

/**
 * The element `{urn:example:registry}person`.
 */
export type Person = {
    attributes: x.NoProperties;
    children: { car?: { attributes: { state: Code; plate: number } }[] };
};
export const person: x.ElementSchema<'person', Person> = x.element(
    'person',
    x.complex({
        content: x.sequence([
            x.element(
                'car',
                x.complex({
                    attributes: [
                        x.attribute('state', Code, { use: 'required' }),
                        x.attribute('plate', x.integer(), { use: 'required' }),
                    ],
                }),
                { namespace: 'urn:example:registry', minOccurs: 0, maxOccurs: 'unbounded' }
            ),
        ]),
    }),
    { namespace: 'urn:example:registry' }
);
