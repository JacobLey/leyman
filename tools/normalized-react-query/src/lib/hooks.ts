import { useState } from 'react';

export const useForceRerender = (): (() => void) => {
    const [, set] = useState(0);
    return () => {
        set(old => old + 1);
    };
};
