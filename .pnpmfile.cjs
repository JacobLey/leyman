// https://github.com/pnpm/pnpm/issues/8934
const readPackage = pkg => {
    if (
        // Both local and npm versions
        pkg.name === 'nx-update-ts-references'
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
