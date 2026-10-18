import ts from 'typescript';

export interface JsDoc {
    description: string | undefined;
    tags: { name: string; text: string | undefined }[];
}

const nameOf = (name: ts.PropertyName): string | undefined =>
    ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;

/**
 * Find the property declarations of an object type, including each object of an intersection or union.
 *
 * @param type - type node
 * @returns property signatures
 */
const propertiesOf = (type: ts.TypeNode): ts.PropertySignature[] => {
    if (ts.isTypeLiteralNode(type)) {
        return type.members.filter(member => ts.isPropertySignature(member));
    }
    if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type)) {
        return type.types.flatMap(member => propertiesOf(member));
    }
    return ts.isParenthesizedTypeNode(type) ? propertiesOf(type.type) : [];
};

/**
 * Read the JSDoc of a generated type, or one of its properties, as TypeScript parses it.
 * Asserting on this, rather than the generated text, leaves the formatting free to change.
 *
 * @param source - generated TypeScript source
 * @param typeName - name of the generated type to read
 * @param property - name of a property of the type, to read its JSDoc instead
 * @returns description and tags, or `undefined` if the type or property is not found, or not documented
 */
export const jsDoc = (source: string, typeName: string, property?: string): JsDoc | undefined => {
    const file = ts.createSourceFile('decanted.ts', source, ts.ScriptTarget.ESNext, true);
    const alias = file.statements
        .filter(statement => ts.isTypeAliasDeclaration(statement))
        .find(statement => statement.name.text === typeName);
    const node =
        property === undefined || !alias
            ? alias
            : propertiesOf(alias.type).find(member => nameOf(member.name) === property);
    const [comment] = node ? ts.getJSDocCommentsAndTags(node) : [];
    if (!comment || !ts.isJSDoc(comment)) {
        return undefined;
    }
    return {
        description: ts.getTextOfJSDocComment(comment.comment),
        tags: (comment.tags ?? []).map(tag => ({
            name: tag.tagName.text,
            text: ts.getTextOfJSDocComment(tag.comment),
        })),
    };
};
