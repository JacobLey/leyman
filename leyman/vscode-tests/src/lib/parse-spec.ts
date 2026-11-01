import ts from 'typescript';

export interface SpecNode {
    readonly kind: 'suite' | 'test';
    readonly name: string;
    /**
     * Zero-based, as editors count.
     */
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
    readonly children: readonly SpecNode[];
}

const KINDS = new Map<string, SpecNode['kind']>([
    ['describe', 'suite'],
    ['it', 'test'],
    ['suite', 'suite'],
    ['test', 'test'],
]);
const MODIFIERS = new Set(['only', 'skip']);

/**
 * The name of what is called.
 *
 * @param callee - expression of the call
 * @returns `test` for `test`, `withTmpDir.test` and `mocha.test.only`
 */
const calledName = (callee: ts.Expression): string | undefined => {
    if (ts.isIdentifier(callee)) {
        return callee.text;
    }
    if (!ts.isPropertyAccessExpression(callee)) {
        return undefined;
    }
    return MODIFIERS.has(callee.name.text) ? calledName(callee.expression) : callee.name.text;
};

/**
 * Finds the tests and suites of a spec from its syntax, without running it. Whatever a call is made on
 * counts, so chained tests are found. A second argument is required, which leaves out `/regex/.test('text')`.
 *
 * A title only known at runtime can't be selected by name, so that call and what is inside it are left out.
 * They run with their enclosing suite, and show up once they have a result.
 *
 * @param fileName - name of the spec, whose extension decides how it is parsed
 * @param text - content of the spec
 * @returns tests and suites, each suite with what it holds
 */
export const parseSpec = (fileName: string, text: string): SpecNode[] => {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);

    const visit = (node: ts.Node, found: SpecNode[]): void => {
        if (ts.isCallExpression(node) && node.arguments.length > 1) {
            const kind = KINDS.get(calledName(node.expression) ?? '');
            const [title] = node.arguments;
            if (kind && title) {
                if (ts.isStringLiteralLike(title)) {
                    const children: SpecNode[] = [];
                    if (kind === 'suite') {
                        ts.forEachChild(node, child => {
                            visit(child, children);
                        });
                    }
                    found.push({
                        kind,
                        children,
                        name: title.text,
                        start: source.getLineAndCharacterOfPosition(node.getStart(source)),
                        end: source.getLineAndCharacterOfPosition(node.getEnd()),
                    });
                }
                return;
            }
        }
        ts.forEachChild(node, child => {
            visit(child, found);
        });
    };

    const found: SpecNode[] = [];
    visit(source, found);
    return found;
};
