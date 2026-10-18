# Sign in from a cloud or headless machine

**Upcoming feature:** this flow requires a CLI release and OnGame authentication
server rollout that include device login. It is not available in CLI 0.2.33.
Use `ongame-cli version` to check your installed version, and consult the
[release notes](https://github.com/gamebyte-ai/ongame-cli/releases) for availability.

Run:

```sh
ongame-cli login --device
```

The CLI prints the official verification URL, a code such as `ABCD-EFGH`, and
when the code expires. Open **https://auth.ongame.ai/oauth/device** on your phone
or another browser. Enter the code, sign in to OnGame, check the account shown,
and choose **Allow CLI access**. The CLI finishes automatically. The cloud
machine only needs outbound HTTPS; the phone never connects to its localhost.

Allowing access lets the CLI use your OnGame account tools, including private
games and metered generation, and stay signed in through normal refresh tokens
for up to 90 days. Approve only a code displayed by a CLI login **you started on
your own device**. Someone asking you to enter their code could gain account
access. Never share the device secret, access token or refresh token.

Codes expire after ten minutes and can authorize only one login. Choose **Deny**
to refuse access, or press **Ctrl+C** in the CLI to stop waiting. Cancellation
stops polling; an unfinished request expires automatically. If the code expires,
the server rejects it, or the token response is lost, start a new login. Temporary
network failures back off and retry until the code expires. If the CLI says device
login is unavailable, wait for the supported release and server rollout.

Credentials use your operating system's secure store. Where a secure store is
unavailable (common on headless Linux), the CLI prints a warning before using a
plaintext file restricted to your current OS user at `~/.ongame/credentials.json`.
Protect the cloud account and its storage. Run `ongame-cli logout` to clear the
locally stored credential; it does not remotely sign out other devices.

On a desktop, `ongame-cli login` still uses the existing browser sign-in flow.
`ongame-cli login --help` (or `-h`) prints usage without starting authentication.
