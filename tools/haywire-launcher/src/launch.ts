import EntryScript, { type Main } from 'entry-script';
import {
    type AsyncContainer,
    type ClassToConstructable,
    type GenericContainer,
    type GenericHaywireId,
    type HaywireIdType,
    identifier,
    type NonExtendable,
    type OutputHaywireId,
} from 'haywire';

export interface WrapperMain extends Main {
    getOriginal: () => Promise<Main>;
}

declare const invalidInput: unique symbol;
interface InvalidInput<T extends string> {
    invalid: T;
    [invalidInput]: typeof invalidInput;
}

type ValidateEntryContainer<C extends GenericContainer> = C extends AsyncContainer<infer U>
    ? [
          NonExtendable<EntryScript, ClassToConstructable<typeof EntryScript>['construct'], null>,
      ] extends U
        ? []
        : [InvalidInput<'ContainerDoesNotOutputEntryScript'>]
    : [InvalidInput<'InputIsNotContainer'>];
type EntryLauncher = <C extends GenericContainer>(
    container: C,
    ...invalidInput: ValidateEntryContainer<C>
) => WrapperMain;

type ValidateIdContainer<C extends GenericContainer, Id extends GenericHaywireId> = [
    ...(C extends AsyncContainer<infer O>
        ? [
              NonExtendable<
                  NonNullable<HaywireIdType<OutputHaywireId<Id>>>,
                  Id['construct'],
                  Id['annotations']['named']
              >,
          ] extends O
            ? []
            : [InvalidInput<'ContainerDoesNotOutputId'>]
        : [InvalidInput<'NotAContainer'>]),
    ...(NonNullable<HaywireIdType<OutputHaywireId<Id>>> extends Main
        ? []
        : [InvalidInput<'IdIsNotMain'>]),
];
type IdLauncher = <C extends GenericContainer, Id extends GenericHaywireId>(
    container: C,
    id: Id,
    ...invalidInput: ValidateIdContainer<C, Id>
) => WrapperMain;

export const launch = ((
    container: {
        getAsync: (val: unknown) => Promise<Main>;
    },
    id = EntryScript
): WrapperMain =>
    /**
     * Anonymous class to be picked up as a subclass of EntryScript.
     */
    class extends EntryScript {
        /**
         * Get the Main implemenation that was generated by container.
         *
         * @returns Main implementation
         */
        public static async getOriginal(): Promise<Main> {
            return container.getAsync(identifier(id).baseId());
        }
        public static override async main(argv: string[]): Promise<void> {
            const main = await this.getOriginal();
            return main.main(argv);
        }
    }) as EntryLauncher & IdLauncher;
