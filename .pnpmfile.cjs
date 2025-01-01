// https://github.com/pnpm/pnpm/issues/8934
const readPackage = pkg => {
    if (
        pkg.name === 'nx-update-ts-references' 
        // Not the local version
        && pkg.dependencies['common-proxy'] != 'workspace:^'
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
