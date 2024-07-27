// Original implementation in Yargs: https://github.com/yargs/yargs/blob/main/lib/utils/process-argv.ts

interface NodeJsProcess {
    versions: Record<string, string | undefined>;
}
interface ElectronProcess extends NodeJsProcess {
    /**
     * {@link https://www.electronjs.org/docs/latest/api/process#processdefaultapp-readonly}
     */
    defaultApp?: boolean;
    versions: {
        /**
         * {@link https://www.electronjs.org/docs/latest/api/process#processversionselectron-readonly}
         */
        electron: string;
    };
}

const isElectronApp = (p: NodeJsProcess): p is ElectronProcess => !!p.versions.electron;
export const getProcessArgvBinIndex = (p: ElectronProcess | NodeJsProcess): 0 | 1 => {
    if (isElectronApp(p) && !p.defaultApp) {
        return 0;
    }
    return 1;
};

const binIndex = getProcessArgvBinIndex(process);

export const args = process.argv.slice(binIndex + 1);
export const bin = process.argv[binIndex];
