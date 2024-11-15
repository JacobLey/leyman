import type { Lockfile } from '@pnpm/lockfile.fs';

type ProjectId = keyof Lockfile['importers'];
type DepPath = keyof Lockfile['packages'];

export const EXAMPLE_LOCKFILE: Lockfile = {
    lockfileVersion: '9.0',
    settings: {
        autoInstallPeers: false,
        excludeLinksFromLockfile: false,
    },
    importers: {
        ['.' as ProjectId]: {
            dependencies: {
                foo: '1.0.0',
            },
            specifiers: {
                foo: '^1.0.0',
            },
        },
        ['ignore' as ProjectId]: {
            dependencies: {
                'ignored-dep': '1.2.3',
            },
            specifiers: {
                'ignored-dep': '^1.1.1',
            },
        },
        ['path/to/package-name' as ProjectId]: {
            dependencies: {
                foo: '1.2.3',
                'other-package': 'link:../other-package',
            },
            specifiers: {
                foo: '^1.1.1',
                'other-package': 'workspace:^',
            },
        },
        ['path/to/package-name/child-package' as ProjectId]: {
            devDependencies: {
                baz: '1.2.3',
                'other-package': 'link:../../other-package',
            },
            specifiers: {
                baz: '^1.1.1',
                'other-package': 'workspace:^',
            },
        },
        ['path/to/other-package' as ProjectId]: {
            dependencies: {
                bar: '1.2.3',
            },
            specifiers: {
                bar: '^1.1.1',
                'ignored-dep': '^1.1.1',
            },
        },
        ['path/to/ignored-package' as ProjectId]: {
            dependencies: {
                bar: '3.2.1',
            },
            devDependencies: {
                'ignored-dep': '3.2.1',
            },
            specifiers: {
                bar: '^3.2.1',
                'ignored-dep': '^3.2.1',
            },
        },
    },
    packages: {
        ['ignored-dep@1.2.3' as DepPath]: {
            dependencies: {
                'ignored-dep-dep': '1.2.3',
            },
            resolution: {
                integrity: '<hash>',
            },
        },
        ['ignored-dep@3.2.1' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['ignored-dep-dep@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['foo@1.0.0' as DepPath]: {
            dependencies: {
                qux: '1.0.0',
            },
            resolution: {
                integrity: '<hash>',
            },
        },
        ['foo@1.2.3' as DepPath]: {
            dependencies: {
                qux: '1.2.3',
            },
            resolution: {
                integrity: '<hash>',
            },
        },
        ['bar@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['bar@3.2.1' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['baz@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['qux@1.0.0' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['qux@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
    },
};

export const PACKAGE_LOCKFILE: Lockfile = {
    lockfileVersion: '9.0',
    settings: {
        autoInstallPeers: false,
        excludeLinksFromLockfile: false,
    },
    importers: {
        ['path/to/other-package' as ProjectId]: {
            dependencies: {
                bar: '1.2.3',
            },
            specifiers: {
                bar: '^1.1.1',
                'ignored-dep': '^1.1.1',
            },
        },
        ['path/to/package-name' as ProjectId]: {
            dependencies: {
                foo: '1.2.3',
                'other-package': 'link:../other-package',
            },
            specifiers: {
                foo: '^1.1.1',
                'other-package': 'workspace:^',
            },
        },
    },
    packages: {
        ['foo@1.2.3' as DepPath]: {
            dependencies: {
                qux: '1.2.3',
            },
            resolution: {
                integrity: '<hash>',
            },
        },
        ['bar@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['qux@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
    },
};
export const PACKAGE_LOCKFILE_NO_LINK: Lockfile = {
    lockfileVersion: '9.0',
    settings: {
        autoInstallPeers: false,
        excludeLinksFromLockfile: false,
    },
    importers: {
        ['path/to/package-name' as ProjectId]: {
            dependencies: {
                foo: '1.2.3',
                'other-package': 'link:../other-package',
            },
            specifiers: {
                foo: '^1.1.1',
                'other-package': 'workspace:^',
            },
        },
    },
    packages: {
        ['foo@1.2.3' as DepPath]: {
            dependencies: {
                qux: '1.2.3',
            },
            resolution: {
                integrity: '<hash>',
            },
        },
        ['qux@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
    },
};
export const CHILD_PACKAGE_LOCKFILE: Lockfile = {
    lockfileVersion: '9.0',
    settings: {
        autoInstallPeers: false,
        excludeLinksFromLockfile: false,
    },
    importers: {
        ['path/to/other-package' as ProjectId]: {
            dependencies: {
                bar: '1.2.3',
            },
            specifiers: {
                bar: '^1.1.1',
                'ignored-dep': '^1.1.1',
            },
        },
        ['path/to/package-name/child-package' as ProjectId]: {
            devDependencies: {
                baz: '1.2.3',
                'other-package': 'link:../../other-package',
            },
            specifiers: {
                baz: '^1.1.1',
                'other-package': 'workspace:^',
            },
        },
    },
    packages: {
        ['bar@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
        ['baz@1.2.3' as DepPath]: {
            resolution: {
                integrity: '<hash>',
            },
        },
    },
};
export const EMPTY_LOCKFILE: Lockfile = {
    lockfileVersion: '9.0',
    settings: {
        autoInstallPeers: false,
        excludeLinksFromLockfile: false,
    },
    importers: {},
};
