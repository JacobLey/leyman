import type { XmlErrorLocation } from './errors.js';
import type {
    CompiledAttribute,
    CompiledComplex,
    CompiledElement,
    CompiledType,
} from './schema/compile.js';
import type { CompiledField, CompiledIdentity, IdentityPath, NameTest } from './schema/identity.js';
import type { CompiledSimple } from './simple/compile-simple.js';
import type { XmlElementNode } from './xml/nodes.js';
import { XeneverValidationError } from './errors.js';
import { describeName, expandedName } from './schema/compile.js';
import { isNameMatch } from './schema/identity.js';
import { compileSimple } from './simple/compile-simple.js';
import { at, written } from './xml/nodes.js';

/**
 * Namespace name of the `xsi` attributes ([XSD 1.0 Part 1 §2.6](https://www.w3.org/TR/xmlschema-1/#Instance_Document_Constructions)).
 */
const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Types of the `xsi` attributes, by local name, as their built-in declarations give them
 * ([§3.2.7](https://www.w3.org/TR/xmlschema-1/#xsi.type)). `parse` doesn't keep them as attributes, but they are
 * attributes of the element all the same, so a field such as `@*` selects them.
 */
const xsiTypes: ReadonlyMap<string, CompiledSimple> = new Map([
    ['type', compileSimple({ kind: 'QName' }, '/')],
    ['nil', compileSimple({ kind: 'boolean' }, '/')],
    ['schemaLocation', compileSimple({ kind: 'list', item: { kind: 'anyURI' } }, '/')],
    ['noNamespaceSchemaLocation', compileSimple({ kind: 'anyURI' }, '/')],
]);

/**
 * A node table ([XSD 1.0 Part 1 §3.11.5](https://www.w3.org/TR/xmlschema-1/#sic-key)): the element each
 * key-sequence identifies. `null` marks a key-sequence that the tables of two children give different elements,
 * which the table of their parent leaves out, `conflicts` counting them.
 */
interface NodeTable {
    readonly entries: Map<string, XmlElementNode | null>;
    conflicts: number;
}

/**
 * Node tables by the id of their `key` or `unique` constraint.
 */
type Tables = Map<string, NodeTable>;

/**
 * Merges the node tables of an element's children: a key-sequence two of them have identifies no element. A
 * child's table never has the same element as another's, as their subtrees don't overlap.
 *
 * @param a - tables of some children, taken over
 * @param b - tables of another child, taken over
 * @returns the merged tables
 */
const mergeTables = (a: Tables | null, b: Tables | null): Tables | null => {
    if (a === null || b === null) {
        return a ?? b;
    }
    for (const [id, table] of b) {
        const existing = a.get(id);
        if (existing === undefined) {
            a.set(id, table);
            continue;
        }
        // The smaller merged into the larger.
        const [into, from] =
            existing.entries.size >= table.entries.size ? [existing, table] : [table, existing];
        for (const [key, node] of from.entries) {
            const found = into.entries.get(key);
            if (found === undefined) {
                into.entries.set(key, node);
                into.conflicts += node === null ? 1 : 0;
            } else if (found !== null) {
                into.entries.set(key, null);
                into.conflicts++;
            }
        }
        a.set(id, into);
    }
    return a;
};

/**
 * An element read inside an element with identity constraints, with what declared it.
 */
interface ReadElement {
    readonly declaration: CompiledElement;
    /**
     * The type it was read as: the declared one, or the one its `xsi:type` selected.
     */
    readonly type: CompiledType;
    readonly isNilled: boolean;
}

/**
 * An element or attribute a field selected.
 */
interface Selected {
    /**
     * The element, or the element of the attribute.
     */
    readonly element: XmlElementNode;
    /**
     * Expanded name of the attribute, `null` for the element.
     */
    readonly attribute: string | null;
    /**
     * Its type, `null` when it has no simple type.
     */
    readonly type: CompiledSimple | null;
    /**
     * Its text, as written or filled in by a `default` or `fixed`; `null` for a nil element.
     */
    readonly text: string | null;
    /**
     * The namespaces a `QName` in its text resolves against: those in scope at the element, or those of the
     * declaration whose `default` or `fixed` filled it in.
     */
    readonly namespaces: ReadonlyMap<string, string>;
    /**
     * Where it is: an attribute filled in by its `default` or `fixed` is at its element.
     */
    readonly location: XmlErrorLocation;
    readonly written: string;
    /**
     * Whether its element declaration is nillable, which a key's field must not be.
     */
    readonly nillable: boolean;
}

/**
 * A field's value: its identity in the value space, and its text, for errors.
 */
interface FieldValue {
    readonly key: string;
    readonly text: string;
}

/**
 * A selected element whose fields all have a value: a member of the qualified node set
 * ([§3.11.4](https://www.w3.org/TR/xmlschema-1/#cvc-identity-constraint), clause 4).
 */
interface Qualified {
    readonly node: XmlElementNode;
    /**
     * Its key-sequence, identifying the values of its fields together.
     */
    readonly key: string;
    readonly values: readonly FieldValue[];
}

/**
 * Lists elements in document order, the element and its descendants.
 *
 * @param node - an element
 * @returns it and every element in it
 */
const descendantsOrSelf = (node: XmlElementNode): XmlElementNode[] => {
    const found: XmlElementNode[] = [];
    const stack = [node];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
        found.push(next);
        for (let index = next.children.length - 1; index >= 0; index--) {
            const child = next.children[index]!;
            if (child.kind === 'element') {
                stack.push(child);
            }
        }
    }
    return found;
};

/**
 * Evaluates the steps of a path, its attribute step left out.
 *
 * @param context - the element the path starts from
 * @param path - where it leads from the element
 * @returns the elements it selects
 */
const selectElements = (context: XmlElementNode, path: IdentityPath): XmlElementNode[] => {
    let nodes = path.isDeep ? descendantsOrSelf(context) : [context];
    for (const step of path.steps) {
        if (step === null) {
            continue;
        }
        const next: XmlElementNode[] = [];
        for (const node of nodes) {
            for (const child of node.children) {
                if (
                    child.kind === 'element' &&
                    isNameMatch(step, child.namespace, child.localName)
                ) {
                    next.push(child);
                }
            }
        }
        nodes = next;
    }
    return nodes;
};

/**
 * Evaluates a selector: the target node set
 * ([§3.11.4](https://www.w3.org/TR/xmlschema-1/#cvc-identity-constraint), clause 1).
 *
 * @param context - the element declaring the constraint
 * @param paths - the selector's paths
 * @returns the elements selected, each once, in document order
 */
const selectTargets = (
    context: XmlElementNode,
    paths: readonly IdentityPath[]
): readonly XmlElementNode[] => {
    const [first] = paths;
    // One path of child steps selects in document order already, each element once.
    if (paths.length === 1 && !first!.isDeep) {
        return selectElements(context, first!);
    }
    const nodes = new Set(paths.flatMap(path => selectElements(context, path)));
    return [...nodes].toSorted((a, b) => a.location.offset - b.location.offset);
};

/**
 * The type of an attribute present on an element.
 *
 * @param complex - type of the element, `null` when it is simple or the element wasn't validated
 * @param namespace - namespace name of the attribute, `null` for none
 * @param localName - its local name
 * @param name - its expanded name
 * @returns its type, `null` when nothing declares it
 */
const attributeType = (
    complex: CompiledComplex | null,
    namespace: string | null,
    localName: string,
    name: string
): CompiledSimple | null => {
    if (namespace === xsiNamespace) {
        return xsiTypes.get(localName) ?? null;
    }
    const wildcard = complex?.anyAttribute;
    const declaration: CompiledAttribute | undefined =
        complex?.attributes.get(name) ??
        (wildcard?.processContents === 'skip' ? undefined : wildcard?.declarations.get(name));
    return declaration?.type ?? null;
};

/**
 * The texts of values, for errors.
 *
 * @param values - field values
 * @returns e.g. `("CA", "123")`
 */
const describeValues = (values: readonly FieldValue[]): string =>
    `(${values.map(({ text }) => JSON.stringify(text)).join(', ')})`;

/**
 * Checks the identity constraints of the elements read inside an element that has some, which are evaluated over
 * its subtree once it is read ([XSD 1.0 Part 1 §3.11.4](https://www.w3.org/TR/xmlschema-1/#cvc-identity-constraint)).
 * Created on the first such element, and dropped once it is done, so elements outside one cost nothing.
 *
 * Every element read inside the scope is recorded with its declaration, which gives the types of the fields
 * selected. The node tables of `key` and `unique` constraints that a keyref of an enclosing element refers to
 * propagate up from element to parent, as §3.11.5 describes; a selector starting with `.//` walks the whole
 * subtree, so nested elements with such constraints each walk their own.
 */
export class IdentityScope {
    readonly #read = new Map<XmlElementNode, ReadElement>();
    #depth = 0;
    /**
     * Node tables of the children of the element being read, so far.
     */
    #tables: Tables | null = null;
    /**
     * How many elements being read have a keyref to each constraint, by its id: only those constraints' node
     * tables are kept.
     */
    readonly #referenced = new Map<string, number>();

    /**
     * Whether every element entered is done, so the scope can be dropped.
     *
     * @returns whether it is done
     */
    public get isDone(): boolean {
        return this.#depth === 0;
    }

    /**
     * Records the declaration of an element read.
     *
     * @param node - the element
     * @param declaration - what declares it
     * @param type - the type it is read as: the declared one, or the one its `xsi:type` selects
     * @param isNilled - whether it is `xsi:nil`
     */
    public record(
        node: XmlElementNode,
        declaration: CompiledElement,
        type: CompiledType,
        isNilled: boolean
    ): void {
        this.#read.set(node, { declaration, type, isNilled });
    }

    /**
     * Starts reading an element.
     *
     * @param declaration - what declares it
     * @returns the node tables of its preceding siblings, to pass to {@link exit}
     */
    public enter(declaration: CompiledElement): Tables | null {
        this.#depth++;
        const { identity } = declaration;
        if (identity !== null) {
            for (const { refer } of identity) {
                if (refer !== null) {
                    this.#referenced.set(refer.id, (this.#referenced.get(refer.id) ?? 0) + 1);
                }
            }
        }
        const siblings = this.#tables;
        this.#tables = null;
        return siblings;
    }

    /**
     * Finishes reading an element: checks its identity constraints, and adds its node tables to those of its
     * siblings.
     *
     * @param node - the element
     * @param declaration - what declares it
     * @param siblings - what {@link enter} returned
     * @throws {XeneverValidationError} when it breaks one of its identity constraints
     */
    public exit(node: XmlElementNode, declaration: CompiledElement, siblings: Tables | null): void {
        this.#depth--;
        const tables = this.#checkConstraints(node, declaration.identity ?? [], this.#tables);
        this.#tables = mergeTables(siblings, tables);
    }

    /**
     * Checks an element's identity constraints, and gives the node tables it passes to its parent: its children's,
     * without the entries they conflict on, and its own.
     *
     * @param node - the element
     * @param constraints - its identity constraints
     * @param children - the merged node tables of its children
     * @returns its node tables
     * @throws {XeneverValidationError} when it breaks one of its identity constraints
     */
    #checkConstraints(
        node: XmlElementNode,
        constraints: readonly CompiledIdentity[],
        children: Tables | null
    ): Tables | null {
        let tables = children;
        // Keys and uniques first: a keyref resolves against the element's own tables too.
        for (const constraint of constraints) {
            if (constraint.kind !== 'keyref') {
                tables = this.#checkUnique(node, constraint, tables);
            }
        }
        if (tables !== null) {
            for (const table of tables.values()) {
                if (table.conflicts === 0) {
                    continue;
                }
                for (const [key, entry] of table.entries) {
                    if (entry === null) {
                        table.entries.delete(key);
                    }
                }
                table.conflicts = 0;
            }
        }
        for (const constraint of constraints) {
            const { refer } = constraint;
            if (refer === null) {
                continue;
            }
            this.#checkKeyref(node, constraint, refer, tables);
            const count = this.#referenced.get(refer.id)! - 1;
            if (count === 0) {
                // No element being read refers to it any more.
                this.#referenced.delete(refer.id);
                tables?.delete(refer.id);
            } else {
                this.#referenced.set(refer.id, count);
            }
        }
        return tables;
    }

    /**
     * Checks a `key` or `unique` constraint, adding its node table when a keyref refers to it.
     *
     * @param node - the element declaring it
     * @param constraint - the `key` or `unique` constraint
     * @param tables - the merged node tables of the element's children
     * @returns the element's node tables
     * @throws {XeneverValidationError} when two selected elements have equal values, or a key's selected element
     * misses a field
     */
    #checkUnique(
        node: XmlElementNode,
        constraint: CompiledIdentity,
        tables: Tables | null
    ): Tables | null {
        const seen = new Map<string, XmlElementNode>();
        for (const { node: target, key, values } of this.#qualified(node, constraint)) {
            const first = seen.get(key);
            if (first !== undefined) {
                throw new XeneverValidationError(
                    `Element ${written(target)} has the values ${describeValues(values)} of \`${first.path}\` too, breaking ${constraint.label} of \`${node.path}\``,
                    at(target)
                );
            }
            seen.set(key, target);
        }
        if (!this.#referenced.has(constraint.id)) {
            return tables;
        }
        const merged = tables ?? new Map<string, NodeTable>();
        let table = merged.get(constraint.id);
        if (table === undefined) {
            table = { entries: new Map(), conflicts: 0 };
            merged.set(constraint.id, table);
        }
        // The element's own entries take precedence over its children's.
        for (const [key, target] of seen) {
            if (table.entries.get(key) === null) {
                table.conflicts--;
            }
            table.entries.set(key, target);
        }
        return merged;
    }

    /**
     * Checks a keyref: each selected element with every field has the values of an entry in the node table of
     * the constraint it refers to.
     *
     * @param node - the element declaring it
     * @param constraint - the keyref
     * @param refer - the constraint it refers to
     * @param refer.id - its id
     * @param refer.label - how errors name it
     * @param tables - the element's node tables
     * @throws {XeneverValidationError} when a selected element's values match no entry
     */
    #checkKeyref(
        node: XmlElementNode,
        constraint: CompiledIdentity,
        refer: { readonly id: string; readonly label: string },
        tables: Tables | null
    ): void {
        const table = tables?.get(refer.id);
        for (const { node: target, key, values } of this.#qualified(node, constraint)) {
            if (table?.entries.has(key) !== true) {
                throw new XeneverValidationError(
                    `Element ${written(target)} has values ${describeValues(values)} that match nothing of ${refer.label}, breaking ${constraint.label} of \`${node.path}\``,
                    at(target)
                );
            }
        }
    }

    /**
     * Evaluates a constraint's selector and fields.
     *
     * @param node - the element declaring it
     * @param constraint - the constraint to evaluate
     * @returns the selected elements that have every field, in document order
     * @throws {XeneverValidationError} when a key's selected element misses a field, or a field selects more
     * than one node, or one without a simple type
     */
    #qualified(node: XmlElementNode, constraint: CompiledIdentity): Qualified[] {
        const qualified: Qualified[] = [];
        for (const target of selectTargets(node, constraint.selector)) {
            const values = this.#values(node, target, constraint);
            if (values !== null) {
                qualified.push({
                    values,
                    node: target,
                    key: JSON.stringify(values.map(({ key }) => key)),
                });
            }
        }
        return qualified;
    }

    /**
     * Evaluates every field of a constraint from a selected element.
     *
     * @param node - the element declaring the constraint
     * @param target - the selected element
     * @param constraint - the constraint to evaluate
     * @returns the value of each field, `null` when one has none
     * @throws {XeneverValidationError} when a key's field has no value, or a field selects more than one node, or
     * one without a simple type
     */
    #values(
        node: XmlElementNode,
        target: XmlElementNode,
        constraint: CompiledIdentity
    ): FieldValue[] | null {
        const values: FieldValue[] = [];
        for (const field of constraint.fields) {
            const value = this.#fieldValue(target, field, constraint);
            if (value === null) {
                if (constraint.kind === 'key') {
                    throw new XeneverValidationError(
                        `Element ${written(target)} has no value for the field ${JSON.stringify(field.text)} of ${constraint.label} of \`${node.path}\``,
                        at(target)
                    );
                }
                return null;
            }
            values.push(value);
        }
        return values;
    }

    /**
     * Evaluates a field from a selected element.
     *
     * @param target - the selected element
     * @param field - one of the constraint's fields
     * @param constraint - the constraint to evaluate
     * @returns its value, `null` when it selects nothing, or a nil element
     * @throws {XeneverValidationError} when it selects more than one node, one without a simple type, or for a
     * key, an element whose declaration is nillable
     */
    #fieldValue(
        target: XmlElementNode,
        field: CompiledField,
        constraint: CompiledIdentity
    ): FieldValue | null {
        let found: Selected | null = null;
        for (const path of field.paths) {
            for (const element of selectElements(target, path)) {
                const candidates =
                    path.attribute === null
                        ? [this.#element(element)]
                        : this.#attributes(element, path.attribute);
                for (const candidate of candidates) {
                    if (
                        found !== null &&
                        (found.element !== candidate.element ||
                            found.attribute !== candidate.attribute)
                    ) {
                        throw new XeneverValidationError(
                            `The field ${JSON.stringify(field.text)} of ${constraint.label} selects more than one node from \`${target.path}\``,
                            at(target)
                        );
                    }
                    found = candidate;
                }
            }
        }
        if (found === null) {
            return null;
        }
        const describe = `The field ${JSON.stringify(field.text)} of ${constraint.label} selects ${found.written}`;
        if (found.type === null) {
            throw new XeneverValidationError(
                `${describe}, which has no simple type`,
                found.location
            );
        }
        if (constraint.kind === 'key' && found.nillable) {
            // [§3.11.4](https://www.w3.org/TR/xmlschema-1/#cvc-identity-constraint), clause 4.2.3.
            throw new XeneverValidationError(
                `${describe}, which is nillable, so it can not be part of a key`,
                found.location
            );
        }
        if (found.text === null) {
            return null;
        }
        return {
            key: found.type.identityKey(found.text, found.namespaces),
            text: found.text,
        };
    }

    /**
     * An element as a field selects it.
     *
     * @param element - an element a field selects
     * @returns it, with its type and text
     */
    #element(element: XmlElementNode): Selected {
        const read = this.#read.get(element);
        const type = read?.type;
        let simple: CompiledSimple | null = null;
        if (type !== undefined) {
            simple = type.kind === 'simple' ? type.simple : type.text;
        }
        let text: string | null = null;
        let namespaces = element.inScopeNamespaces;
        if (simple !== null && !read!.isNilled) {
            const { empty, emptyNamespaces } = read!.declaration;
            if (empty !== null && element.children.length === 0) {
                text = empty;
                namespaces = emptyNamespaces;
            } else {
                // A simple type or text content holds no elements.
                text = element.children
                    .filter(child => child.kind === 'text')
                    .map(child => child.text)
                    .join('');
            }
        }
        return {
            element,
            text,
            namespaces,
            attribute: null,
            type: simple,
            location: at(element),
            written: `\`${element.path}\``,
            nillable: read?.declaration.nillable === true,
        };
    }

    /**
     * The attributes of an element that a name test matches, including those its declaration fills in.
     *
     * @param element - the element whose attributes to match
     * @param test - the attribute's name test
     * @returns them, with their types and texts
     */
    #attributes(element: XmlElementNode, test: NameTest): Selected[] {
        const type = this.#read.get(element)?.type;
        const complex: CompiledComplex | null = type?.kind === 'complex' ? type : null;
        const selected: Selected[] = [];
        const present = new Set<string>();
        for (const attribute of element.attributes) {
            const name = expandedName(attribute.namespace, attribute.localName);
            present.add(name);
            if (!isNameMatch(test, attribute.namespace, attribute.localName)) {
                continue;
            }
            selected.push({
                element,
                attribute: name,
                type: attributeType(complex, attribute.namespace, attribute.localName, name),
                text: attribute.value,
                namespaces: element.inScopeNamespaces,
                location: at(attribute),
                written: `\`${attribute.path}\``,
                nillable: false,
            });
        }
        const declared = complex?.attributes ?? new Map<string, CompiledAttribute>();
        for (const [name, declaration] of declared) {
            if (
                declaration.absent !== null &&
                !present.has(name) &&
                isNameMatch(test, declaration.namespace, declaration.name)
            ) {
                selected.push({
                    element,
                    attribute: name,
                    type: declaration.type,
                    text: declaration.absent,
                    namespaces: declaration.absentNamespaces,
                    location: at(element),
                    written: `attribute ${describeName(declaration.namespace, declaration.name)} of \`${element.path}\``,
                    nillable: false,
                });
            }
        }
        return selected;
    }
}
