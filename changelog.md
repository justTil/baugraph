# Changelog

All notable changes to this project will be documented in this file.

## [1.29.0]

### Added

- **A VS Code extension.** `*.baugraph.json` files open on the canvas inside VS
  Code instead of as JSON — the same editor as the web app, running in a custom
  editor and writing the same file. Edits go into the document the way a text
  edit does, so `⌘S`, undo, revert, hot exit, the Timeline and the source-control
  diff all behave normally, and a split text editor on the same file stays in
  step as you type. **Format Document** on a diagram file rewrites it in
  canonical form, `*.baugraph.json` is bound to the published JSON Schema for
  editing the source by hand, and exports go through a save dialog. Built from
  this repository with `npm run extension:package`; see `docs/vscode.md`.
- **Presentation mode.** Toggle it from the toolbar, press **P**, or hit **Esc**
  to leave — the nav, header, toolbar and inspector all drop away and, where the
  browser allows it, the page goes full screen too. The laser pointer stays one
  switch away in a small floating control, since the toolbar it normally lives
  in is hidden along with everything else. The canvas itself goes view-only for
  as long as it's on: dragging, connecting, resizing, the right-click menu,
  double-click rename and every editing shortcut are disabled, with a one-time
  reminder shown at the top of the canvas — the same spot the laser pointer's
  own hint uses — so a click that does nothing doesn't come as a surprise. For
  the first five seconds the hint sits a little lower, clear of the laser/exit
  controls in the corner, then settles back to its normal spot.
- **A foldable inspector.** A new button in its header collapses the panel on
  the right to a thin rail and back, freeing up room to work the canvas without
  losing the panel entirely. The choice is remembered across reloads.
- **A "Demo" badge on the worked examples.** The three sample diagrams opened
  on a first visit now carry a small alert in the top-left corner of the
  canvas, so it's clear at a glance that what's on screen is a shipped example
  rather than the user's own work.

### Changed

- **Diagram files are now written in a canonical order.** Nodes come out in
  hierarchy order — a zone, then everything inside it — connections are grouped
  by the node they leave, flows are ordered by id, and the keys of a `data`
  block are sorted. Array order never carried meaning (paint order comes from a
  node's `kind`, and a flow's hops from the graph), but it used to be whatever
  order the diagram happened to be drawn in, so two people building the same
  diagram produced files full of moved blocks and no changes. The same diagram
  now has exactly one file. Saving an existing diagram once will show this as a
  one-off reordering diff.
- **Toolbar buttons now carry their label alongside the icon** for message
  flows, play/pause, presentation mode and the laser pointer, so they're easier
  to scan at a glance. Magnet, grid and the diagram theme toggle stay
  icon-only.

### Fixed

- **Night mode now themes the whole app, not just the canvas.** Toggling a
  diagram to dark previously repainted only the canvas; the sidebar, header
  and inspector panel stayed on their light styling. The toggle now flips the
  rest of the app's chrome along with it, so the whole UI is dark.

## [1.28.0]

### Added

- **Manual edge routing with waypoints.** Drag anywhere along a connection to
  drop a bend point; the line is then drawn straight through your points instead
  of auto-routing around obstacles. Move several waypoints at once, delete them
  one at a time, or pick **Reset routing** from an edge's context menu to hand
  it back to the auto-router. Waypoints round-trip through `.baugraph.json` as a
  per-edge `waypoints` list (one point per line) and are covered by the JSON
  Schema and the generated AI skills.
- **Watermarks on exports.** SVG, PNG and GIF exports can carry a diagonally
  tiled caption — a `DRAFT` stamp, or a short issued-to id from the **Random**
  button. It is drawn as one rotated SVG pattern so it covers the whole image
  edge to edge, scales to the export size, and — like every export — never
  leaves the browser.
- **In-app changelog.** A **What's New** entry in the sidebar renders this file
  as a formatted release history.
- **Laser pointer.** A presentation aid — toggle it from the toolbar or press
  **L** and the cursor becomes a glowing dot that follows you over the canvas;
  hold and drag to draw a stroke that fades after a couple of seconds, for
  circling something in a meeting. Scroll-to-pan and pinch-to-zoom still work;
  presses on the canvas draw instead of moving anything. **Esc** turns it off.
- Docs
- "Self host with Docker" link in the app header, pointing at the Docker Hub image
- Two more worked example diagrams (a CI/CD pipeline and a three-tier web app),
  opened as their own tabs alongside the order-processing example on a first visit

### Changed

- Privacy policy now names Cloudflare as the DNS/CDN provider in front of the
  GitHub Pages host

## [1.27.0]

### Added

- Created amd64 docker image (before it was only arm)

## [1.26.0]

### Added

- Created first docker image

## [1.25.0] - 2026-08-22

Baugraph is a browser-based architecture-diagram editor built on Vue Flow.
This is the current state of the project; there have been no tagged releases
before this one, so everything built since the initial commit is listed here.

### Added

- Canvas editor for architecture diagrams: drag nodes from a palette, connect
  them, group them into labelled/nestable zones, and lock nodes/zones in place.
- Node-type (~90) and technology (~250) catalogues, grouped into categories,
  with a searchable palette and matching context-menu/inspector pickers.
- Connection points per node side (up to six), spread evenly and reflowed on
  resize, with an inspector-driven point picker and an "auto" mode.
- Sizing that fits a node's label/caption/icon automatically, manual resize by
  dragging an edge, and `⇧⌘F` to re-fit the selection (or everything).
- Copy/paste, including via a right-click context menu.
- Undo/redo, multi-select, alignment and snapping while dragging.
- Message-flow animation: send a message along a path with forks that either
  multiply or route one-by-one, per-connection style overrides, and both
  discrete-token and marching-line rendering (GSAP + CSS/SVG), including
  reduced-motion handling.
- Multi-tab support with a save dialog and diagram naming.
- Export to `.baugraph.json`, SVG (with animated flows via SMIL) and PNG
  (2x/4x), plus macOS-specific native save/export options.
- A Monaco-based JSON editor for viewing and hand-editing diagram files.
- Migration of exports from the legacy single-file `diagram-tool.html`.
- JSON Schema for `.baugraph.json`, generated from the app's zod schema, with
  in-app validation and error reporting on open.
- AI skills generated from the diagram schema for working with
  `.baugraph.json` files.
- Legal/impressum page.
- Build, deploy and process-management tooling (`build.sh`, `manage.sh`) and
  a GitHub Pages deploy workflow on a self-hosted runner.

### Changed

- Numerous UI passes on layout, sidebar, tabs, wrapping, labels, fonts and
  overall visualization/message-flow behaviour.

### Fixed

- Diagram edge rendering, node editing, panel and sidebar layout issues found
  along the way.

[1.28.0]: https://github.com/justTil/baugraph/releases/tag/1.28.0
[1.27.0]: https://github.com/justTil/baugraph/releases/tag/1.27.0
[1.26.0]: https://github.com/justTil/baugraph/releases/tag/1.26.0
[1.25.0]: https://github.com/justTil/baugraph/releases/tag/1.25.0
