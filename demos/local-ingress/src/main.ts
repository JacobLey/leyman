// The page's entry, loaded by index.html. Vite serves it from `src/`, compiling as it goes.
import { renderGreeting } from './page.js';

renderGreeting(globalThis.document);
