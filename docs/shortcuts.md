# Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Shift` + drag | Rubber-band select |
| Scroll / pinch | Pan / zoom |
| `F` | Fit the view to the diagram |
| `⇧⌘F` | Size the selection to its text (everything, if nothing is selected) |
| `Enter` | Rename the selected node |
| `⌘D` | Duplicate the selection |
| `⌘G` | Wrap the selection in a zone |
| `⇧⌘L` | Lock the selection |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘S` | Download the `.baugraph.json` |
| `⌫` | Delete selection |
| Arrow keys | Nudge (`⇧` = ×5) |

The current diagram autosaves to `localStorage`, so a reload never loses
work. That copy is a convenience, not the source of truth — export the JSON
and commit it.
