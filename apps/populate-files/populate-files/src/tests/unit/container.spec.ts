import { suite, test } from 'mocha-chain';
import { populateFilesContainer } from '../../container.js';

suite('container', () => {
    test('passes check', () => {
        populateFilesContainer.check();
    });
});
