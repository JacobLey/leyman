import { identifier } from 'haystack-di';

export type Logger = Pick<typeof console, 'error'>;

export const loggerIdentifier = identifier<Logger>();
