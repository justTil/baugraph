# Changelog

All notable changes to this project will be documented in this file.

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
