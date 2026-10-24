// Plays the user's browser for `notes login`, run as `$BROWSER` with the authorization URL: signs in at the dev
// authorization server, and comes back to the CLI's redirect URI. With `BROWSER_ANSWER`, it comes back with that
// query instead (`{state}` and `{iss}` filled in). With `BROWSER_USER`, it signs in as that user.
import { followAuthorization } from '@leyman/demo-oauth-server';

const authorization = new URL(process.argv[2]!);
// eslint-disable-next-line n/no-process-env -- How a test signs in as someone else
const user = process.env.BROWSER_USER;
if (user !== undefined) {
    // As a user typing their name in at the dev server's login, which accepts any account
    authorization.searchParams.set('login_hint', user);
}
const callback = await followAuthorization(
    authorization,
    authorization.searchParams.get('redirect_uri')!
);
// eslint-disable-next-line n/no-process-env -- How a test asks for another answer
const answer = process.env.BROWSER_ANSWER;
if (answer !== undefined) {
    const query = new URLSearchParams(answer);
    for (const name of ['iss', 'state']) {
        if (query.get(name) === `{${name}}`) {
            query.set(name, callback.searchParams.get(name)!);
        }
    }
    callback.search = query.toString();
}
// As a browser does, it asks for the page's icon too
await fetch(new URL('/favicon.ico', callback));
await fetch(callback);
