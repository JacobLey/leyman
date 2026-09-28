import { Formatter } from '#lib';

export type { FileFormatter, FilesFormatter, Formatters, TextFormatter } from '#types';

export const { formatFiles, formatFile, formatText } = new Formatter();
