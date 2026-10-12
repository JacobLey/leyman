import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { LoadPopulateFilesCli } from './cli.js';
import { cliContainer } from './container.js';

export default launch(cliContainer, identifier(LoadPopulateFilesCli));
