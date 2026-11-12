/**
 * Matching child elements against a content model, by derivatives of the model as a regular expression over
 * element names ([Brzozowski 1964](https://doi.org/10.1145/321239.321249)), with counted repetition and XSD's
 * `all` group as terms of their own. Each child derives the model by its name; an empty model (no match
 * possible) is an error at that child, and a model left that doesn't accept the end is an error at the parent.
 * Unlike a deterministic automaton it needs no Unique Particle Attribution, and unlike backtracking it reads
 * each child once.
 */

/**
 * Something a child element may match: an element declaration, by expanded name, or a wildcard, by namespace.
 */
export interface ModelSymbol {
    /**
     * Identifies the symbol in its model.
     */
    readonly id: string;
    /**
     * How errors name what was expected, e.g. `` `item` ``.
     */
    readonly label: string;
    /**
     * Whether it is a wildcard, which only matches a child no element declaration can match there.
     */
    readonly isWildcard: boolean;
    /**
     * Whether a child matches.
     */
    readonly matches: (child: ModelChild) => boolean;
}

/**
 * A child element, by name.
 */
export interface ModelChild {
    /**
     * Expanded name (see `expandedName`).
     */
    readonly name: string;
    readonly namespace: string | null;
}

/**
 * The model after a child, and whether a wildcard matched it.
 */
export interface Derived {
    readonly term: Term;
    readonly isWildcard: boolean;
}

/**
 * A content model before matching: a tree of particles.
 */
export type Pattern =
    | {
          readonly kind: 'repeat';
          readonly item: Pattern;
          readonly min: number;
          readonly max: number;
      }
    | { readonly kind: 'all'; readonly parts: readonly AllPart[]; readonly optional: boolean }
    | { readonly kind: 'choice'; readonly items: readonly Pattern[] }
    | { readonly kind: 'sequence'; readonly items: readonly Pattern[] }
    | { readonly kind: 'symbol'; readonly symbol: ModelSymbol };

/**
 * A particle of an `all` group: a symbol and how many times it occurs.
 */
export interface AllPart {
    readonly symbol: ModelSymbol;
    readonly min: number;
    readonly max: number;
}

/**
 * A term of the model as it is being matched.
 */
type Node =
    | { readonly t: 'all'; readonly parts: readonly AllPart[]; readonly counts: readonly number[] }
    | { readonly t: 'alt'; readonly items: readonly Term[] }
    | { readonly t: 'empty' }
    | { readonly t: 'fail' }
    | { readonly t: 'repeat'; readonly item: Term; readonly min: number; readonly max: number }
    | { readonly t: 'seq'; readonly items: readonly Term[] }
    | { readonly t: 'symbol'; readonly symbol: ModelSymbol };

/**
 * A term, interned: equal terms are the same object, so derivatives can be cached by term.
 */
export interface Term {
    readonly id: number;
    readonly node: Node;
    /**
     * Whether the term accepts no more children.
     */
    readonly nullable: boolean;
}

/**
 * Labels of what may come next in a model, for errors.
 *
 * @param term - a model
 * @returns labels of the symbols that may come next, in model order, without repeats
 */
export const expectedLabels = (term: Term): readonly string[] => {
    const labels = new Set<string>();
    const visit = (current: Term): void => {
        const { node } = current;
        switch (node.t) {
            case 'symbol': {
                labels.add(node.symbol.label);
                break;
            }
            case 'seq': {
                for (const item of node.items) {
                    visit(item);
                    if (!item.nullable) {
                        break;
                    }
                }
                break;
            }
            case 'alt': {
                for (const item of node.items) {
                    visit(item);
                }
                break;
            }
            case 'repeat': {
                visit(node.item);
                break;
            }
            case 'all': {
                for (const [index, part] of node.parts.entries()) {
                    if (node.counts[index]! < part.max) {
                        labels.add(part.symbol.label);
                    }
                }
                break;
            }
            case 'empty':
            case 'fail': {
                // Neither the empty nor the failed term expects anything.
                break;
            }
            // No default
        }
    };
    visit(term);
    return [...labels];
};

/**
 * A content model, ready to match children: interns its terms and caches their derivatives.
 */
export class ContentModel {
    readonly #interned = new Map<string, Term>();
    readonly #derivatives = new Map<Term, Map<string, Term>>();
    readonly #allGroups = new Map<readonly AllPart[], number>();
    readonly #empty: Term;
    readonly #fail: Term;

    /**
     * The model before any child.
     */
    public readonly start: Term;

    /**
     * @param pattern - particles of the content model
     */
    public constructor(pattern: Pattern) {
        this.#empty = this.#intern('e', { t: 'empty' }, true);
        this.#fail = this.#intern('f', { t: 'fail' }, false);
        this.start = this.#build(pattern);
    }

    /**
     * The model after a child, or a failed term (see {@link isFailed}) when the child can't come next. A child
     * that an element declaration can match next is matched by it, not by a wildcard: XSD 1.1 resolves that
     * competition in favor of the element
     * ([XSD 1.1 Part 1 §3.8.6.4](https://www.w3.org/TR/xmlschema11-1/#cos-nonambig)).
     *
     * @param term - model before the child
     * @param child - its name
     * @returns the model after it, and whether a wildcard matched it
     */
    public derive(term: Term, child: ModelChild): Derived {
        const asElement = this.#derived(term, child, false);
        return asElement === this.#fail
            ? { term: this.#derived(term, child, true), isWildcard: true }
            : { term: asElement, isWildcard: false };
    }

    /**
     * Whether no child can follow.
     *
     * @param term - a model
     * @returns whether it is failed
     */
    public isFailed(term: Term): boolean {
        return term === this.#fail;
    }

    #derived(term: Term, child: ModelChild, isWildcard: boolean): Term {
        let cached = this.#derivatives.get(term);
        if (!cached) {
            cached = new Map();
            this.#derivatives.set(term, cached);
        }
        const cacheKey = `${isWildcard ? '*' : ''}${child.name}`;
        let derived = cached.get(cacheKey);
        if (!derived) {
            derived = this.#derive(term, child, isWildcard);
            cached.set(cacheKey, derived);
        }
        return derived;
    }

    #intern(key: string, node: Node, isNullable: boolean): Term {
        let term = this.#interned.get(key);
        if (!term) {
            term = { id: this.#interned.size, nullable: isNullable, node };
            this.#interned.set(key, term);
        }
        return term;
    }

    #build(pattern: Pattern): Term {
        let built: Term;
        switch (pattern.kind) {
            case 'symbol': {
                built = this.#symbol(pattern.symbol);
                break;
            }
            case 'sequence': {
                built = this.#seq(pattern.items.map(item => this.#build(item)));
                break;
            }
            case 'choice': {
                built = this.#alt(pattern.items.map(item => this.#build(item)));
                break;
            }
            case 'repeat': {
                built = this.#repeat(this.#build(pattern.item), pattern.min, pattern.max);
                break;
            }
            case 'all': {
                const all = this.#all(
                    pattern.parts,
                    pattern.parts.map(() => 0)
                );
                built = pattern.optional ? this.#alt([this.#empty, all]) : all;
                break;
            }
            // No default
        }
        return built;
    }

    #symbol(symbol: ModelSymbol): Term {
        return this.#intern(`s${symbol.id}`, { t: 'symbol', symbol }, false);
    }

    #seq(terms: readonly Term[]): Term {
        const items: Term[] = [];
        for (const term of terms) {
            if (term === this.#fail) {
                return this.#fail;
            }
            if (term.node.t === 'seq') {
                items.push(...term.node.items);
            } else if (term !== this.#empty) {
                items.push(term);
            }
        }
        if (items.length === 0) {
            return this.#empty;
        }
        if (items.length === 1) {
            return items[0]!;
        }
        return this.#intern(
            `q${items.map(item => item.id).join(',')}`,
            { t: 'seq', items },
            items.every(item => item.nullable)
        );
    }

    #alt(terms: readonly Term[]): Term {
        const unique = new Map<number, Term>();
        for (const term of terms) {
            const members = term.node.t === 'alt' ? term.node.items : [term];
            for (const item of members) {
                if (item !== this.#fail) {
                    unique.set(item.id, item);
                }
            }
        }
        const items = unique
            .values()
            .toArray()
            .toSorted((a, b) => a.id - b.id);
        if (items.length === 0) {
            return this.#fail;
        }
        if (items.length === 1) {
            return items[0]!;
        }
        return this.#intern(
            `a${items.map(item => item.id).join(',')}`,
            { t: 'alt', items },
            items.some(item => item.nullable)
        );
    }

    #repeat(item: Term, min: number, max: number): Term {
        if (max === 0 || item === this.#empty) {
            return this.#empty;
        }
        if (item === this.#fail) {
            return min === 0 ? this.#empty : this.#fail;
        }
        if (min === 1 && max === 1) {
            return item;
        }
        return this.#intern(
            `r${item.id},${min},${max}`,
            { t: 'repeat', item, min, max },
            min === 0 || item.nullable
        );
    }

    #all(parts: readonly AllPart[], counts: readonly number[]): Term {
        let group = this.#allGroups.get(parts);
        if (group === undefined) {
            group = this.#allGroups.size;
            this.#allGroups.set(parts, group);
        }
        return this.#intern(
            `l${group}:${counts.join(',')}`,
            { t: 'all', parts, counts },
            parts.every((part, index) => counts[index]! >= part.min)
        );
    }

    #derive(term: Term, child: ModelChild, isWildcard: boolean): Term {
        const isMatch = (symbol: ModelSymbol): boolean =>
            symbol.isWildcard === isWildcard && symbol.matches(child);
        const { node } = term;
        let derived: Term;
        switch (node.t) {
            case 'symbol': {
                derived = isMatch(node.symbol) ? this.#empty : this.#fail;
                break;
            }
            case 'seq': {
                const [head, ...rest] = node.items as [Term, ...Term[]];
                const tail = this.#seq(rest);
                const headDerived = this.#seq([this.#derived(head, child, isWildcard), tail]);
                derived = head.nullable
                    ? this.#alt([headDerived, this.#derived(tail, child, isWildcard)])
                    : headDerived;
                break;
            }
            case 'alt': {
                derived = this.#alt(node.items.map(item => this.#derived(item, child, isWildcard)));
                break;
            }
            case 'repeat': {
                // One more occurrence starts: what is left of it, then the remaining occurrences.
                derived = this.#seq([
                    this.#derived(node.item, child, isWildcard),
                    this.#repeat(node.item, Math.max(node.min - 1, 0), node.max - 1),
                ]);
                break;
            }
            case 'all': {
                derived = this.#alt(
                    node.parts.map((part, index) =>
                        isMatch(part.symbol) && node.counts[index]! < part.max
                            ? this.#all(
                                  node.parts,
                                  node.counts.map((count, countIndex) =>
                                      countIndex === index ? count + 1 : count
                                  )
                              )
                            : this.#fail
                    )
                );
                break;
            }
            case 'empty':
            case 'fail': {
                derived = this.#fail;
                break;
            }
            // No default
        }
        return derived;
    }
}
