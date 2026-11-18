/**
 * Every error drop-when throws.
 */
export abstract class DropWhenError extends Error {}

/**
 * A request to GitHub's API failed: no answer, or an answer other than success.
 */
export class GitHubError extends DropWhenError {
    /**
     * The API URL requested.
     */
    public readonly url: string;

    public constructor(url: string, message: string) {
        super(message);
        this.name = 'GitHubError';
        this.url = url;
    }
}
