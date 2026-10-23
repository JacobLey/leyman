import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { NotesCli } from './cli.js';
import { cliContainer } from './container.js';

export default launch(cliContainer, identifier(NotesCli));
