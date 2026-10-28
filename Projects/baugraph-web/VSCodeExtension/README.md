# Building and publishing the VS Code extension

The extension's source lives in [`/extension`](../extension); this folder
holds the *process* around it — scripts and guidance for turning that source
into a `.vsix`, whether you're building it for yourself or shipping it to the
Marketplace.

Two audiences, two documents:

- **[BUILD_YOUR_OWN.md](BUILD_YOUR_OWN.md)** — for anyone who clones or forks
  this repository and wants a working `.vsix` to install locally. No account,
  token or publisher access required.
- **[PUBLISH_TO_MARKETPLACE.md](PUBLISH_TO_MARKETPLACE.md)** — for `justtil`,
  the extension's publisher, to ship a release to the VS Code Marketplace.

Both rely on the same two scripts, both runnable from anywhere:

| Script | Who it's for | What it does |
| --- | --- | --- |
| [`scripts/build-vsix.sh`](scripts/build-vsix.sh) | Anyone | Builds the webview + host and packages `extension/baugraph-<version>.vsix` |
| [`scripts/publish-marketplace.sh`](scripts/publish-marketplace.sh) | `justtil` | Builds, then publishes that package to the Marketplace |

Both are thin wrappers around the `npm run extension:*` scripts defined in
the repository root [`package.json`](../package.json) — read them if you want
to run the steps by hand instead.

## Why a `.vsix` needs two halves built first

The extension ships two things bundled together:

- **The editor** — the same Vue web app as [baugraph.com](https://baugraph.com),
  built for a VS Code webview by `vite.vscode.config.ts` into `extension/media/`.
- **The host** — a small Node bundle (`extension/src/extension.ts`, built by
  `extension/build.mjs` with esbuild) that owns the file: commands, the custom
  editor registration, the formatter.

`npm run extension:package` builds both, then runs `vsce package` inside
`extension/`. Neither script here reinvents that — they just make sure the
right dependencies are installed first and tell you where the result landed.

See [`docs/vscode.md`](../docs/vscode.md) for what the extension does from a
user's perspective, and [`extension/README.md`](../extension/README.md) for
the developer-facing build/debug notes (F5, watch mode, etc.).
