import type { NxPlugin } from '@nx/devkit';
import type { LifecyclePluginOptions } from 'nx-lifecycle/plugin';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import * as plugin from 'nx-lifecycle/plugin';

suite('plugin', () => {
    test('Exports an Nx plugin', () => {
        expect(plugin.name).to.equal('nx-lifecycle');
        expect(plugin.createNodes[0]).to.equal('**/project.json');
        expect(plugin.createNodes[1]).to.be.a('function');
        expect(plugin.createDependencies).to.be.a('function');
    });

    test('types', () => {
        expectTypeOf(plugin).toExtend<NxPlugin<LifecyclePluginOptions>>();
    });
});
