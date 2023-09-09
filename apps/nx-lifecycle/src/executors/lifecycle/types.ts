import type { ExecutorContext } from '@nx/devkit';

export type SimpleExecutorContext = Pick<ExecutorContext, 'projectsConfigurations' | 'root'>;