const errors = {
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input',
};

/**
 * A generic error utility function.
 *
 * @param type - The error type key.
 * @throws Throws a `RangeError` with the applicable error message.
 */
export const rangeError = (type: keyof typeof errors): never => {
    throw new RangeError(errors[type]);
};

export const checkOverflow = (
    lower: number,
    upper: number,
    {
        gte = false,
        error,
    }: {
        gte?: boolean;
        error?: keyof typeof errors;
    } = {}
): void => {
    if (gte ? lower >= upper : lower > upper) {
        throw new RangeError(
            error
                ? errors[error]
                : 'Overflow: input needs wider integers to process'
        );
    }
};
