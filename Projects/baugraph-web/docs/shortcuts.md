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
`R` starts the turntable. Nodes are moved the way a 3D editor moves objects —
`G` grabs the selection, `X` / `Y` / `Z` lock it to an axis, a typed number
moves it exactly that far, and `Alt G` puts it back where the canvas has it —
and the numpad drives the camera: `1` / `3` / `7` front, right and top views,
`2` `4` `6` `8` to turn, `.` to frame the selection. Middle-drag orbits and
`⇧` middle-drag pans. See [the 3D view](./3d-view#getting-around).

The current diagram autosaves to `localStorage`, so a reload never loses
work. That copy is a convenience, not the source of truth — export the JSON
and commit it.
