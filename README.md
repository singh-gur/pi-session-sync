# @singh-gur/pi-session-sync

Sync [pi](https://pi.dev) session files across machines through a **private** git repository.

> **Warning: the sync repo MUST be private.** Session files contain your prompts, code, tool output
> (file contents, command output) and possibly secrets such as API keys or tokens. They are not
> encrypted or redacted.

## Install

Requires **Node.js >= 24.16**, **pi 1.x** (tested with 1.5.2), and `git` on your `PATH` with access to your sync repo.

```sh
pi install npm:@singh-gur/pi-session-sync
```

Then start pi, or run `/reload` in a running session, and create the [config file](#configure).

Other ways to install:

```sh
# Try it for the current run only
pi -e npm:@singh-gur/pi-session-sync

# Install from GitHub
pi install git:github.com/singh-gur/pi-session-sync

# Install from a local checkout
pi install /path/to/pi-session-sync

# Update installed pi packages
pi update --extensions
```

To pin a release, append `@<version>` to the npm package spec, for example `npm:@singh-gur/pi-session-sync@0.1.0`. Pinned versions are skipped by package updates.

Install the same package on every machine you want to sync, each with its own config file.

## Configure

Create `~/.pi/agent/git-session-sync.json` on each machine (it is machine-local and never synced):

```json
{
  "repoUrl": "git@github.com:me/pi-sessions.git",
  "branch": "main",
  "roots": { "dev": "/home/me/dev", "home": "/home/me" },
  "auto": { "pullOnStart": false, "pushOnShutdown": false }
}
```

- `repoUrl` (required): any URL `git` can clone; use an empty private repo. Git authentication uses your normal git setup.
- `branch`: defaults to `main`.
- `roots` (required): named root directories. Names use `a-z`, `0-9`, `_` and `-`; paths must be absolute.
- `auto`: both options default to `false`.

### Roots and placeholders

Only sessions whose working directory is under a configured root are synced. On push, every
occurrence of a root path in the session (cwd, messages, tool calls and results) is replaced with a
placeholder such as `{{PISYNC:dev}}`; the longest matching root wins. On pull, placeholders are
replaced with *this* machine's path for the same root name. So `/home/me/dev/proj` on one machine
becomes `/Users/me/code/proj` on another when both define a `dev` root.

Sessions that use a root name this machine does not define are skipped on pull, with a warning.

## Commands

- `/session-sync-push`: pick sessions to push (only the current session is pre-selected). Space/Enter toggles an item, Esc finishes, then confirm.
- `/session-sync-pull`: fetch the repo and pick from sessions that are new or changed compared to your local copies. If the current session is updated, pi reloads it. The current session is only updated when the agent is idle.

## Auto mode (off by default)

- `pullOnStart`: when pi starts, pull all new or changed sessions in the background, except the current session. Failures are shown as warnings and never block startup.
- `pushOnShutdown`: when you quit pi, push the current session if it is under a root.

## How merging works

Your local session files are the source of truth; the local clone at
`~/.pi/agent/git-session-sync/repo` is a disposable cache that is reset to the remote before each
operation. Sessions are merged entry by entry (by id), so the same session continued on two
machines keeps both branches (see `/tree`). Entries are ordered by timestamp and the newest entry
becomes the active leaf. If the same entry id has different content on each side, the local
version is kept and the conflict is reported. Pull never deletes local files.

## Limitations

- POSIX paths only (no Windows).
- Only pi's default session directory is supported (no custom `sessionDir`).
- Sessions with a different session format version are skipped.
- The repo grows without bound (sessions can include base64 images).
- Rewriting replaces any string that contains a root path, including coincidental matches in message text.
- No encryption or redaction; see the warning above.

## Development

```sh
just install  # pnpm install --frozen-lockfile
just check    # typecheck + tests + pack dry run
just try      # run pi with the extension loaded
```

Release:

```sh
just check
just bump patch   # or minor / major: bumps version, tags, pushes
just publish      # pnpm publish to npm
```

## License

MIT
