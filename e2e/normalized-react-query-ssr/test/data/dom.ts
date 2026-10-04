import { GlobalRegistrator } from '@happy-dom/global-registrator';

// `react-dom` checks for a DOM when it is first loaded, so this must be imported before it.
GlobalRegistrator.register();
