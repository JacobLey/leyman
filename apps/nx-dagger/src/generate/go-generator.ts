import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import * as changeCase from 'change-case';
import { Eta } from 'eta';
import { file as tmpFile } from 'tmp-promise';
import type { TemplateContext } from './lib/types.js';

const execFileAsync = promisify(execFile);
const eta = new Eta();
const compiledTemplate = new Eta()
    .compile(
        await readFile(Path.join(import.meta.dirname, '../../src/generate/main.go.eta'), 'utf8')
    )
    .bind(eta);

export type GenerateGoFile = (context: TemplateContext) => Promise<string>;

export const generateGoFile: GenerateGoFile = async (context: TemplateContext): Promise<string> => {
    const rendered = compiledTemplate({
        ...context,
        changeCase,
    });

    const file = await tmpFile({ postfix: '.go' });

    await writeFile(file.path, rendered, 'utf8');

    await execFileAsync('gofmt', ['-w', file.path]);

    const data = await readFile(file.path, 'utf8');
    await file.cleanup();

    return data;
};
