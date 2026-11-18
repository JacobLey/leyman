const durationPattern = /^(?<count>\d+)(?<unit>[dh])$/v;
const hoursPerDay = 24;

/**
 * Parses a minimum age: whole days (`7d`) or hours (`12h`). A day is 24 hours, as release dates are instants.
 *
 * @param text - as given on the command line
 * @returns the duration, or `null` when it isn't one
 */
export const parseMinAge = (text: string): Temporal.Duration | null => {
    const groups = durationPattern.exec(text)?.groups;
    if (!groups) {
        return null;
    }
    const count = Number(groups.count);
    return Temporal.Duration.from({ hours: groups.unit === 'd' ? count * hoursPerDay : count });
};
