# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/justTil/baugraph/compare/v1.25.0...HEAD
[1.25.0]: https://github.com/justTil/baugraph/releases/tag/v1.25.0
