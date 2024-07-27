import { EntryScript } from 'entry-script';

interface Tracker {
    value?: unknown;
}

export const tracker: Tracker = {
    value: null,
};

/**
 * @override
 */
export class EntryScriptStatic extends EntryScript {
    public static override async main(): Promise<void> {
        tracker.value = this;
    }
}

/**
 * @override
 */
export class EntryScriptInstance extends EntryScript {
    public override async main(): Promise<void> {
        tracker.value = this;
    }
}
