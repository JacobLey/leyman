import { useState } from 'react';

export const useForceRerender = (): (() => void) => {
    // eslint-disable-next-line sonarjs/hook-use-state
    const [, set] = useState(0);
    return () => {
        set(old => old + 1);
    };
};
