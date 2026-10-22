/**
 * Convert a name from a schema (e.g. a `$defs` key like `user-profile`) to a PascalCase type name.
 *
 * @param name - name from the schema
 * @returns valid TypeScript type name
 */
export const toTypeName = (name: string): string => {
    const words = name.split(/[^\p{L}\p{N}$_]+/v).filter(word => word.length > 0);
    const joined = words.map(word => word[0]!.toUpperCase() + word.slice(1)).join('');
    if (joined === '') {
        return 'Type';
    }
    return /^\p{N}/v.test(joined) ? `T${joined}` : joined;
};

/**
 * Assigns each generated type a unique name.
 */
export class TypeNames {
    /**
     * Starts with the global types generated code refers to (`Record` for objects, `Exclude` in the OpenAPI helpers), which a
     * generated type must not shadow.
     */
    readonly #used = new Set<string>(['Exclude', 'Record']);

    /**
     * Reserve a unique type name, appending a number if the name is already used.
     *
     * @param name - name from the schema
     * @returns unique type name
     */
    public reserve(name: string): string {
        const base = toTypeName(name);
        let unique = base;
        let suffix = 1;
        while (this.#used.has(unique)) {
            suffix++;
            unique = `${base}${suffix}`;
        }
        this.#used.add(unique);
        return unique;
    }
}
