import { formatFileContainer, formatterId, formatterWrapperId } from './container.js';

export type { FileFormatter, FilesFormatter, Formatters, TextFormatter } from '#types';

export const [{ formatFiles }, { formatFile, formatText }] = await Promise.all([
    formatFileContainer.getAsync(formatterId),
    formatFileContainer.getAsync(formatterWrapperId),
]);
