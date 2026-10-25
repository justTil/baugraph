# The VS Code extension

Baugraph runs inside VS Code as a custom editor: open a `*.baugraph.json` file
and you get the diagram rather than its source. It is the same editor as the web
app — same canvas, same inspector, same palette — writing the same file, next to
the code it describes.

## Installing it

The extension is built from this repository:

```sh
npm install
npm run extension:package     # writes extension/baugraph-<version>.vsix
code --install-extension extension/baugraph-<version>.vsix
```

## What you get

- **Diagrams open on a canvas.** `*.baugraph.json` is bound to the Baugraph
  editor. The title bar's **Open as JSON Text** switches to the raw file, and
  **Open as Diagram** switches back. Both views can be open at once, split — an
  edit on either side shows up on the other.
- **A file like any other file.** Changes go into the document the way a text
  edit does, so the dirty dot, `⌘S`, revert, hot exit, the Timeline and the
  source-control diff all work as they do everywhere else in the editor.
- **Format Document canonicalises the file.** Running VS Code's formatter on a
  diagram file rewrites it exactly as the canvas would have saved it: arrays
  sorted, defaults dropped, keys in the format's order. With
  `editor.formatOnSave`, a diagram edited by hand — or by an AI assistant —
  normalises itself on the way to the disk. **Baugraph: Sort and Normalise
  Diagram File** does the same to a file from the Explorer, without opening it.
- **Schema support in the text editor.** `*.baugraph.json` is bound to the
  published JSON Schema, so editing the source directly gives completion and
  inline errors.
- **Exports** (PNG, SVG, GIF) go through a normal save dialog.

## Commands

| Command | What it does |
| --- | --- |
| `Baugraph: New Diagram…` | Creates a diagram file and opens it on the canvas |
| `Baugraph: Open as Diagram` | Opens the current file in the Baugraph editor |
| `Baugraph: Open as JSON Text` | Opens the current diagram in the text editor |
| `Baugraph: Sort and Normalise Diagram File` | Rewrites a diagram file in canonical form |

## How it fits together

The extension is two halves that share one model.

The **host** is a small Node bundle that owns the file. It never parses a
diagram to edit one — it moves text, and every change it makes goes through a
`WorkspaceEdit`, which is why undo, save and the diff view need no special
handling. The one place it reads the format is the formatter above.

The **editor** is the web app, built for a webview from the same `src/`. It is
the only side that parses and writes `.baugraph.json`, using the same
[`@/model`](/file-format) the browser build uses — so a file written from VS Code
and a file written from [baugraph.com](https://baugraph.com) are byte-identical,
down to the order of the arrays.

## Known limits

- The canvas keeps its own undo stack, and VS Code keeps one for the file.
  While the canvas has focus `⌘Z` is the canvas's; in a text editor on the same
  file it is VS Code's. Both end up in the file, but they do not interleave.
- A change from outside the canvas — a text edit, a revert, a branch switch —
  reloads the diagram, which clears the canvas's selection and undo history.
- A diagram on a read-only file system opens as a read-only canvas.
