// Only loads the build of this worktree, so the extension itself never needs a build or an update.
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const vscode = require('vscode');

const build = join(__dirname, '..', '..', '..', 'leyman', 'vscode-tests', 'dist', 'index.js');

exports.activate = async context => {
    try {
        const { activate } = await import(pathToFileURL(build).href);
        return await activate(context, vscode);
    } catch (error) {
        vscode.window.showWarningMessage(
            `Leyman tests failed to load, so run \`nx run @leyman/vscode-tests:build\` and reload the window. ${error}`
        );
        return undefined;
    }
};
