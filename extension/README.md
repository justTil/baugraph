# Baugraph for VS Code

Architecture diagrams that live in your repository — edited on a canvas, stored
as plain JSON next to the code they describe.

Open any `*.baugraph.json` file and you get the diagram instead of its source:
nodes, zones, connections, message flows, the inspector, the palette. It is the
same editor as [baugraph.com](https://baugraph.com), running inside VS Code and
writing the same file.

## What it does

- **Custom editor for `*.baugraph.json`.** Double-click a diagram file in the
  Explorer and it opens on the canvas. `Baugraph: Open as JSON Text` (or the
  button in the editor's title bar) switches to the raw file and back.
- **Normal VS Code editing.** Every change goes into the file through the same
  mechanism a text edit does, so the dirty dot, ⌘S / Ctrl+S, ⌘Z / Ctrl+Z, revert,
  hot exit, Timeline and the SCM diff all behave the way they do everywhere else.
  Editing the JSON in a split text editor updates the canvas as you type.
- **Canonical formatting.** *Format Document* on a `.baugraph.json` file rewrites
  it the way the editor writes it: arrays sorted, defaults dropped, keys in the
  format's order. Turn on `editor.formatOnSave` and hand-edited diagrams
  normalise themselves. `Baugraph: Sort and Normalise Diagram File` does the same
  to a file you have not opened — right-click it in the Explorer.
- **Schema validation in the text editor.** `*.baugraph.json` is bound to the
  published JSON Schema, so editing the source gives you completion and inline
  errors.
- **Exports.** PNG, SVG and GIF export through a normal save dialog.

## Commands

| Command | What it does |
| --- | --- |
| `Baugraph: New Diagram…` | Creates a `.baugraph.json` file and opens it on the canvas |
| `Baugraph: Open as Diagram` | Opens the current file in the Baugraph editor |
| `Baugraph: Open as JSON Text` | Opens the current diagram in the text editor |
| `Baugraph: Sort and Normalise Diagram File` | Rewrites a diagram file in canonical form |

## Why the file is worth committing

A `.baugraph.json` file is written to be read in a pull request: ids derived
from labels, defaults omitted, coordinates rounded, one line per node position,
and every array in a fixed order. The same diagram produces the same bytes
whoever saved it and in whatever order they drew it, so a diff shows what
changed and nothing else.

See [the format documentation](https://baugraph.com/docs/file-format) for the
full story.

## Building it from source

The extension is two halves: the editor, which is the web app built for a
webview, and the host, which owns the file. Both are built from the repository
root:

```sh
npm install            # once, in the repository root
npm run extension:build
```

That produces `extension/media/` (the editor) and `extension/dist/` (the host).

To debug it, press <kbd>F5</kbd> — from the repository root or from this folder,
both are configured. **Run the VS Code extension** builds both halves unminified
and with sourcemaps (so breakpoints in `src/extension.ts` bind), then opens an
Extension Development Host with `examples/` loaded; open any diagram there.

While iterating, run the **Watch the extension** task (or `npm run
extension:watch` in the root) and both halves rebuild on save. Changes to the
host need the Development Host restarted (<kbd>⌘R</kbd> in that window);
changes to the editor only need *Developer: Reload Webviews*.

To produce an installable package:

```sh
npm run extension:package    # writes extension/baugraph-<version>.vsix
```

Install it with `code --install-extension extension/baugraph-<version>.vsix`, or
from the Extensions view's `…` menu → *Install from VSIX…*.

## Known limits

- Undo inside the canvas and VS Code's own undo are two stacks over one file.
  While the canvas has focus, ⌘Z is the canvas's; in a text editor on the same
  file, it is VS Code's. Both end up in the file, but they do not interleave.
- A change made outside the canvas — a text edit, a revert, a branch switch —
  reloads the diagram, which clears the canvas's selection and its undo history.
- The editor needs a workspace it can write to; a diagram opened from a
  read-only file system opens as a read-only canvas.
