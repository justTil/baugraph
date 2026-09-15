# Building your own `.vsix`

You don't need to be the `justtil` publisher, have a Marketplace account, or
have any token to build a working copy of the Baugraph extension yourself —
from this repository as-is, or from your own fork with local changes. This
produces a `.vsix` file you install directly into VS Code; it never talks to
the Marketplace.

## Prerequisites

- [Node.js](https://nodejs.org) matching the `engines.node` range in the
  repository root [`package.json`](../package.json) (currently `^22.18.0` or
  `>=24.12.0`)
- VS Code (or a compatible fork — Cursor, VSCodium, etc.) to install into

## The fast path

From the repository root:

```sh
./VSCodeExtension/scripts/build-vsix.sh
```

This runs `npm ci` in both the repository root and `extension/`, builds the
webview and the extension host, and packages the result with `vsce`. It
prints the path to the finished file, e.g. `extension/baugraph-1.29.0.vsix`.

Add `--install` to also install it into VS Code immediately (needs the `code`
CLI — Command Palette → *Shell Command: Install 'code' command in PATH*, if
it isn't already on your `PATH`):

```sh
./VSCodeExtension/scripts/build-vsix.sh --install
```

Already have `node_modules` in both places and just want to rebuild after a
change? Skip the installs:

```sh
./VSCodeExtension/scripts/build-vsix.sh --no-install
```

## Installing the result

Either:

```sh
code --install-extension extension/baugraph-<version>.vsix
```

or, inside VS Code: Extensions view → **…** menu (top right) → **Install from
VSIX…** → pick the file.

VS Code treats a `.vsix` install like any other extension — it shows up in
the Extensions list, updates when you install a newer `.vsix` over it, and
uninstalls the normal way. It does **not** auto-update itself the way a
Marketplace install does, since it isn't attached to a Marketplace listing;
re-run the build and reinstall whenever you want a newer version.

## Doing this by hand

The script is a convenience wrapper, not the only way. Equivalent manual
steps from the repository root:

```sh
npm install                    # root deps (the webview build)
npm --prefix extension install # extension deps (esbuild, vsce, @types/vscode)
npm run extension:package      # builds both halves, then `vsce package`
```

`npm run extension:package` expands to `extension:build` (webview + host)
followed by `extension:vsix` (`vsce package --no-dependencies`, run inside
`extension/`). See the `scripts` block in the root
[`package.json`](../package.json) and in [`extension/package.json`](../extension/package.json)
for the individual steps if you want to run just one — e.g. `npm run
extension:webview:watch` while iterating on the editor UI.

## Making changes before you build

If you're building your own `.vsix` because you want to change something —
not just to install a stock copy — the extension is built entirely from this
repository's `src/` (the editor) and `extension/src/` (the host):

- `npm run extension:debug` (or press <kbd>F5</kbd> from the repository root
  or from `extension/` — both have launch configs) opens an Extension
  Development Host with unminified builds and source maps, so breakpoints in
  `extension/src/extension.ts` bind and `examples/` loads automatically.
- `npm run extension:watch` rebuilds both halves on save. A host change needs
  <kbd>⌘R</kbd> in the Development Host window to pick up; an editor change
  only needs *Developer: Reload Webviews*.

Once it behaves the way you want, build the `.vsix` as above.

## Troubleshooting

- **`vsce package` fails with a publisher/version complaint** — `vsce`
  validates `extension/package.json` even for a local package. Check
  `publisher`, `version` (must be valid semver) and `engines.vscode` are all
  present and sane; they already are in this repository unless you've edited
  them.
- **The `.vsix` installs but the canvas is blank** — the webview half
  (`extension/media/`) wasn't built, or was built stale. Re-run the full
  build rather than `--no-install`/a partial `npm run extension:host` alone.
- **Changing the publisher name** — if you're distributing your own fork
  under a different identity, change `publisher` (and probably `name`) in
  `extension/package.json` first; a `.vsix` bakes those in.
