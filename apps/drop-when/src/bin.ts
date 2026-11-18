import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { DropWhenCli } from './cli.js';
import { cliContainer } from './container.js';

export default launch(cliContainer, identifier(DropWhenCli));
