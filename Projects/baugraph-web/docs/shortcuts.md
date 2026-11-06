# Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Shift` + drag | Rubber-band select |
| `⌥` + drag | Ignore the grid and the alignment guides |
| `Shift` + drag a connection dot | Slide it along its side |
| Drag a connection's label | Move it along the line, or off it (double-click to put it back) |
| Scroll / pinch | Pan / zoom |
| `F` | Fit the view to the diagram |
| `B` | Open or close the palette overview — every node type and technology at once |
| `⇧⌘F` | Size the selection to its text (everything, if nothing is selected) |
| `Enter` | Rename the selected node |
| `⌘D` | Duplicate the selection |
| `⌘G` | Wrap the selection in a zone |
| `⇧⌘L` | Lock the selection |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘S` | Download the `.baugraph.json` |
| `⌫` | Delete selection |
| Arrow keys | Nudge (`⇧` = ×5) |
| `3` | Switch between the diagram and [the 3D view](./3d-view) |

The 3D view is for looking, so the editing keys do nothing there — only `⌘Z` /
`⇧⌘Z` still undo and redo. `←` / `→` step the flow spotlight, `F` fits
everything and `R` starts the turntable. Drag orbits, right-drag (or `⇧`
middle-drag) pans, scroll zooms, and a click on a node flies to it. See
[the 3D view](./3d-view#getting-around).

The current diagram autosaves to `localStorage`, so a reload never loses
work. That copy is a convenience, not the source of truth — export the JSON
and commit it.
