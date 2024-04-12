import { identifier } from 'haywire';

export type Logger = Pick<typeof console, 'error'>;

export const loggerIdentifier = identifier<Logger>();
