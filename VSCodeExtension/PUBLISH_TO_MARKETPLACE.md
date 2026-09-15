# Publishing to the VS Code Marketplace

This is the `justtil`-only release process. If you're building the extension
for yourself and don't need a public Marketplace listing, use
[BUILD_YOUR_OWN.md](BUILD_YOUR_OWN.md) instead.

Publishing is done with [`vsce`](https://github.com/microsoft/vscode-vsce)
(`@vscode/vsce`, already a dev dependency of `extension/`), driven by
[`scripts/publish-marketplace.sh`](scripts/publish-marketplace.sh).

## One-time setup

You only need to do this once per machine (the token can be reused; the
publisher only needs to be created once ever).

### 1. Create the `justtil` publisher

If it doesn't already exist: go to
[marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage),
sign in with a Microsoft account, and create a publisher with the ID
`justtil` — it must match `publisher` in
[`extension/package.json`](../extension/package.json) exactly, since that's
what ties future updates to this listing.

### 2. Get a Personal Access Token (PAT)

The Marketplace uses Azure DevOps for auth, not a Marketplace-side login:

1. Go to [dev.azure.com](https://dev.azure.com), sign in with the **same**
   Microsoft account, and create an organization if you don't have one (any
   name — it doesn't need to relate to `justtil` or this project).
2. Click your profile icon → **Personal access tokens** → **New Token**.
3. Set:
   - **Organization**: *All accessible organizations*
   - **Scopes**: *Custom defined* → **Marketplace** → **Manage**
   - An expiry you're comfortable with (Azure caps this at one year; you'll
     need to repeat this step when it lapses)
4. Copy the token now — Azure shows it exactly once.

### 3. Authenticate `vsce`

Either store it so you don't need to pass it every time:

```sh
npx --prefix extension vsce login justtil
# pastes the PAT when prompted; cached locally by vsce
```

or export it per-session/per-CI-run instead (what the publish script expects
if you don't log in):

```sh
export VSCE_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Never commit a PAT, put it in a script, or paste it into a shared shell
history. Treat it like a password — anyone with it can publish under
`justtil`.

## Pre-publish checklist

The important fields are already in place in
[`extension/package.json`](../extension/package.json) — `publisher`,
`repository`, `license`, `engines.vscode`, `categories`, `keywords` — but
worth a glance before a first-ever publish, or after touching the manifest:

- [ ] `version` is bumped and matches root [`version.txt`](../version.txt)
      exactly (the publish script refuses to run otherwise — see below).
- [ ] [`extension/README.md`](../extension/README.md) reads the way you want
      it to on the Marketplace — it *is* the listing's description, verbatim.
- [ ] The root [`changelog.md`](../changelog.md) has an entry for this
      version. The Marketplace listing's "Changelog" tab looks for a
      `CHANGELOG.md` inside `extension/` specifically; there isn't one yet,
      so that tab will be empty until one is added there (a copy or symlink
      of the relevant root changelog entries, or a dedicated one — your
      call).
- [ ] No `icon` field is set in `extension/package.json` yet, so the listing
      shows a generic default icon. Optional but worth adding — a 128×128
      PNG referenced as `"icon": "media/icon.png"` (or similar path relative
      to `extension/`).

None of these block a publish; they're listing quality, not requirements.

## Versioning

Two files need to agree, and the publish script checks this before doing
anything else:

- [`version.txt`](../version.txt) at the repository root — the single source
  of truth for the web app's version, baked into the browser build.
- `version` in [`extension/package.json`](../extension/package.json) — what
  `vsce` actually publishes.

Bump both to the same value when cutting a release. There's no automated
sync between them today; if you want one, a good place to add it would be a
small check or a version-bump script here rather than hand-editing both, but
until then just keep them in step by hand.

## Publishing

From the repository root:

```sh
# see what would happen without publishing anything
./VSCodeExtension/scripts/publish-marketplace.sh --dry-run

# the real thing — builds, then asks you to confirm before publishing
VSCE_PAT=xxxxx ./VSCodeExtension/scripts/publish-marketplace.sh
# (omit VSCE_PAT if you ran `vsce login justtil` already)

# non-interactive (CI, or you just don't want the prompt)
VSCE_PAT=xxxxx ./VSCodeExtension/scripts/publish-marketplace.sh --yes
```

The script:

1. Checks `version.txt` and `extension/package.json` agree, and warns (but
   doesn't stop) if the working tree is dirty.
2. Runs `npm ci` in both the root and `extension/`, builds the webview and
   host, and packages a `.vsix` — the exact same artifact
   `build-vsix.sh` would produce.
3. On `--dry-run`, stops there so you can inspect the package.
4. Otherwise asks for confirmation (unless `--yes`), then runs `vsce publish
   --packagePath` against that built `.vsix` — publishing exactly what was
   just built and packaged, not a fresh `vsce package` from source.

A successful run prints the listing URL:
`https://marketplace.visualstudio.com/items?itemName=justtil.baugraph`.
Updates typically show up within a few minutes; VS Code installs then see it
as a normal extension update.

## After publishing

- **Verify the listing** — open the URL above and check the description,
  version and changelog tab render the way you expect.
- **Tag the release in git** if you don't already do this elsewhere in your
  release process — the `.vsix` itself isn't checked in (`extension/*.vsix`
  is build output), so the tag plus the Marketplace listing are what let you
  find the exact source for a published version later.
- **Mistakes**: `vsce unpublish justtil.baugraph` removes the *entire*
  listing, not just the last version — it's not the tool for taking back a
  bad release. To fix a bad publish, bump the version and publish again; use
  `vsce unpublish` only if you want the listing gone entirely.

## Doing this by hand

The script only wraps two things:

```sh
npm run extension:package                              # from the repo root
cd extension && npx vsce publish --packagePath baugraph-<version>.vsix
```

Everything above (PAT scope, `login` vs. `VSCE_PAT`, the version check) still
applies whether or not you use the script.
