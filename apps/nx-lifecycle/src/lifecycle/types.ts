import type { ExecutorContext } from '@nx/devkit';

export interface NxContext {
    root: ExecutorContext['root'];
    projects: {
        name: string;
        root: string;
    }[];
}
