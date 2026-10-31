# Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Shift` + drag | Rubber-band select |
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

In the 3D view, a few keys change meaning: `↑` / `↓` move the selection one
plane up or down, `←` / `→` step the flow spotlight, `F` fits the stack and
`R` starts the turntable. See [the 3D view](./3d-view#getting-around).

The current diagram autosaves to `localStorage`, so a reload never loses
work. That copy is a convenience, not the source of truth — export the JSON
and commit it.
