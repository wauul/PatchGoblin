# GitHub identity and repository authorization

PatchGoblin has two separate registered applications under the GitHub account `wauul`:

- **PatchGoblin OAuth App**, registration **3894466**: [developer settings](https://github.com/settings/applications/3894466). Homepage `https://patchgoblin.vercel.app`; exact callback `https://patchgoblin.vercel.app/api/auth/callback`. Wildcards and device flow are disabled. Expiring user tokens are enabled.
- **PatchGoblin CI GitHub App**, App ID **5136754**: [public installation page](https://github.com/apps/patchgoblin-ci). Installation selects repositories and grants the implemented Actions, contents, workflows, pull requests and checks permissions.

`/api/auth/login` uses `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`. It requests an empty scope (public identity), uses PKCE S256, a browser-bound one-use state with a ten-minute expiry, and exchanges the authorization code on the server. It verifies the identity with GitHub `/user`, creates a seven-day secure HTTP-only session, and discards the identity OAuth token. It does not store an identity access/refresh token or use it to access repositories.

Repository authorization is a separate explicit onboarding action at `/api/github/connect`. It uses the GitHub App's `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, binds the one-use state to the current session account, and verifies that GitHub returns that same account. Its encrypted user token is used to confirm the intersection of the user's real permissions and selected App installations. Actual repository operations use one-hour installation tokens restricted to the selected repository; credentials never enter the sandbox or extension. Expiring GitHub App user credentials refresh with an exclusive database lease.

Store all client secrets and the token encryption key only in private server configuration. Local registration credentials are in ignored `.local/github-oauth.env` and `.local/github-app.env`; `scripts/provision-product.mjs --vercel` provisions them through stdin without printing values. Apply `db/002_product.sql` before deploying a change to authentication. Never prefix secrets with `VITE_`.

Existing sessions and repository authorization remain valid when the identity provider changes. Signing out invalidates the current session; the next sign-in uses the separate OAuth App. Account deletion removes the encrypted repository grant, sessions and account data. GitHub installation and authorization revocation remain available in GitHub settings.

Source: [GitHub's OAuth authorization documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). The code tests cover identity-only scopes, separation of token persistence, browser state, PKCE and rejection of a mismatched repository identity. Hosted browser verification is recorded in the product verification report.
