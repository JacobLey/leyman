import { bind, createContainer } from 'haywire';
import { nxDaggerId, nxDaggerModule } from '../../generate/index.js';
import { DaggerGenerate } from './generate.js';

const daggerGenerateModule = nxDaggerModule.addBinding(
    bind(DaggerGenerate).withDependencies([nxDaggerId]).withConstructorProvider()
);

const daggerGenerate = createContainer(daggerGenerateModule).get(DaggerGenerate);

export default daggerGenerate.generate;
