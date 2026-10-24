import { formatFileContainer, Formatter } from '#lib';

export type {
    FileFormatter,
    FileFormatterOptions,
    FilesFormatter,
    Formatters,
    TextFormatter,
    TextFormatterOptions,
} from '#types';

export const { formatFiles, formatFile, formatText } = formatFileContainer.get(Formatter);
