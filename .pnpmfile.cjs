// https://github.com/pnpm/pnpm/issues/8934
const haywireLauncherConsumers = new Set(['nx-update-ts-references', 'pnpm-dedicated-lockfile']);
const readPackage = pkg => {
    if (
        haywireLauncherConsumers.has(pkg.name) && pkg.dependencies['npm-entry-script']
    ) {
        pkg.dependencies['entry-script'] = pkg.dependencies['npm-entry-script'];
        pkg.dependencies['haywire'] = pkg.dependencies['npm-haywire'];
    }
    return pkg;
};

module.exports = {
    hooks: {
        readPackage,
    },
};
