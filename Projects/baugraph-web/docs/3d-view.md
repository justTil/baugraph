# The 3D view

Press `3` — or **3D** in the toolbar, or in the switch at the top right of the
canvas — and the diagram stands up in layers. Every node starts exactly where
it is on the 2D canvas, lifted onto the *plane* it belongs to: the same
diagram, looked at with a height axis added.

The nodes stand up too. Each one is the canvas's node stood up off its back,
facing the front, so its name, type and icon read the way they do on the
canvas from wherever the stack is looked at — a database is a standing drum, a
decision a standing diamond. Look from straight above and they lie back down,
and the view from above is the 2D diagram again.

From there you can [arrange it in 3D](#moving-nodes-in-3d) — grab nodes, drag
them along an axis, lift them — the way a 3D editor such as Blender moves
objects. Those moves belong to the 3D view alone: the 2D canvas never sees
them, and a diagram nobody arranges in 3D carries nothing of it.

That axis only earns its place if it means something, so you decide what it
means:

- **Trust zones** — external, DMZ, application, data. A connection that
  crosses a boundary becomes a vertical cable and stands out from any angle,
  which is exactly the question an audit asks.
- **Tiers** — presentation, application, data.
- **Environments** — dev, test, prod stacked, so drift between them shows.
- **Layers** — network, integration, applications, the way OSI layers are
  drawn.

All of it is optional and sits on top of the diagram. A file with no planes
is a 2D diagram, exactly as before; the 2D canvas and every export ignore the
3D settings; and the view itself — on or off, the camera, the spotlight — is
never saved, so a diagram always opens flat.

## Planes

Planes are the 3D view's layers, and they are built on the 2D canvas. Open the
panel on the canvas's left edge and switch it from **Layers** (every node,
nested by zone) to **Planes**. It lists the stack top to bottom, each plane
with the nodes standing on it:

- **+** names a new plane and puts it on top. The first plane is the ground:
  anything that does not say otherwise stands on it.
- **Point at a plane** and the canvas fades everything that is not on it, so
  you can see what a plane holds without leaving 2D.
- **Double-click** a plane's name to rename it, and click its swatch to
  recolour it. Its **⋯** menu raises or lowers it, selects everything on it,
  or deletes it — what stood on a deleted plane goes back to its zone's
  plane, or the ground.

The inspector's **3D planes** section, shown when nothing is selected, edits
the same list. The 3D view has it as a legend in its top-left corner: click a
plane's name to fly to it, hide it from the view with the eye (the diagram is
not changed), or — with nodes selected — put the whole selection on it with
the arrow.

## Putting nodes on planes

On the canvas:

- **Drag** rows in the Planes tab onto a plane. A zone takes everything
  inside it along.
- **Right-click** a node, or a selection, and pick a plane under **Plane** —
  or **New plane…** to name one and put them on it in one go.
- **Select** nodes and click the arrow on a plane's row to put them on it.

A node put on the plane its zone already stands on goes back to following the
zone, so the file only names a plane where a node really stands apart.

A node's inspector has a **3D** section — at the top while the 3D view is on,
at the bottom otherwise:

- **Plane** — which plane the node stands on. **Auto** follows its zone, so
  putting a zone on a plane takes everything inside it along; a node with no
  zone stands on the ground. Pick a plane to set one node apart from its zone.
- **Height** — *Flat*, *Low*, *Regular*, *Tall* or *Tower*. Use it to say
  what matters at a glance: the database that carries the load, the gateway
  everything depends on. *Low* and *Regular* stand on the floor, *Low* the
  thinner of the two; *Tall* and *Tower* stand on a post, high over the rest.
  *Flat* does not stand at all — the node lies on its back, the way a floor
  marking does.

Select several nodes and the same section sets them all at once. In the 3D
view, `↑` and `↓` move the selection one plane up or down — the quickest way
to build a stack is to click through a diagram pressing arrows.

## Moving nodes in 3D

The 3D view opens as the canvas's layout, but it does not have to stay that
way: move nodes about in 3D until the stack reads the way you want, and the
2D diagram stays exactly as it was. A node moved in 3D gets a 3D place of its
own; one never moved there keeps following the canvas.

**Grab with `G`.** Select one or more nodes and press `G`: the selection
follows the pointer until a click or `Enter` puts it down, and `Esc` or a
right-click puts it back. While it is moving:

| Key | Does |
| --- | --- |
| `X` / `Y` / `Z` | Lock the move to that axis — press it again to let go |
| `⇧X` / `⇧Y` / `⇧Z` | Lock it to the plane of the other two; `⇧Z` keeps it on its floor |
| digits, `.`, `-`, `⌫` | Type an exact distance along the locked axis (x when none is) |
| hold `⇧` | Fine adjustment: the pointer moves it a tenth as far |
| hold `Ctrl` | Snapping the other way round from the canvas's grid setting |

With nothing locked, a grab moves along the screen, the way it does in a 3D
editor. The bar at the top says how far it has gone, along what, and how to
finish; the locked axis is drawn through where the move started. `X` and `Y`
are the canvas's own axes and `Z` is height, coloured red, green and blue.

**Drag a selected node** to move it across its floor, the way a drag works on
the canvas. Dragging an unselected node, or empty space, still orbits.

**Drag the gizmo.** The selection carries a move gizmo: an arrow per axis, a
square per pair of axes, and a ring in the middle that moves along the
screen. The arrows button in the bar at the bottom hides it.

**Put it back.** `Alt G` returns the selection to where the canvas has it.
The inspector's **3D** section shows a node's **Location** — `X`, `Y`, and `Z`,
its height above its plane — to type into, with **Reset** to send it back; the
bar at the bottom has a button that resets every node at once.

A zone takes what it holds along, as on the canvas. A node inside it that
was never moved in 3D keeps its place within the zone — add one on the
canvas later and it lands inside the zone in 3D too — and one placed on its
own moves along with it.

A node keeps its plane wherever it is moved: lifting it raises it above its
plane, it does not put it on the next one up — that is still `↑`. A
connection between two nodes standing at different heights becomes a cable,
the same as one between planes. A route with hand-placed bend points keeps
them while both of its ends move together, and routes itself once they part.
Moves are undone with `⌘Z` like any other edit.

## Getting around

| Input | Does |
| --- | --- |
| Drag, or middle-drag | Orbit |
| Right-drag, or `⇧` middle-drag | Pan |
| Scroll | Zoom |
| Click / `⇧`-click | Select / add to the selection — the same selection as the canvas |
| Double-click | Fly to a node; on empty space, fit everything |
| `G` | Grab the selection — see [moving nodes in 3D](#moving-nodes-in-3d) |
| `Alt G` | Put the selection back where the canvas has it |
| Numpad `1` / `3` / `7` | Look from the front / the right / above; with `Ctrl`, from the other side |
| Numpad `2` `4` `6` `8` | Turn the view in steps |
| Numpad `.` / `Home` | Frame the selection / everything |
| Numpad `+` / `-` | Zoom |
| `F` | Fit the stack |
| `R` | Turntable — a slow spin, for leaving a diagram on screen |
| `↑` / `↓` | Move the selection one plane up / down |
| `←` / `→` | Spotlight the previous / next message flow |
| `3` | Back to 2D |

The axis ball in the top-right corner shows which way `X`, `Y` and `Z` point;
click one to look straight along it.

The bar at the bottom left switches between an angled view, the view from
above (the 2D layout, from the top, every node lying back down) and the view
from the side (the stack itself, every boundary crossing a vertical line). **Spread** pulls the planes
apart or lays them flat on each other, and the camera button saves the
current view as a PNG.

## Message flows in 3D

[Message flows](./message-flows) run through the stack exactly as they run
across the canvas: the same hops, the same timing, the same split where a path
forks.

A connection on one floor runs between the standing nodes at the height of
their faces and plugs into them where the canvas has it: into a side at the
height its connection point has on the canvas side, into the back near the top
for one to the canvas top, and into the front at the foot for one to the
bottom — clear of the text on the face. Between a node on a post and one on
the floor it rises evenly from the one to the other. One between planes is a
cable out of the top of the lower node and into the foot of the higher, so a
message visibly leaves its zone.

Messages travel as what the flow says they are. A dot is a bead of light; a
**packet** is a parcel, taped down the middle, and an **envelope** a letter
with its flap folded down — drawn like the canvas's glyphs on every side, in
the flow's colour, and turned to face the way they are going. A connection the
flow styles differently changes the message as it passes, the same as on the
canvas: an envelope can become a red packet on the way to a dead-letter queue.
Where a message reaches a node, a ripple in its colour marks the landing.

`←` and `→` step a **spotlight** through the flows. The one in the spotlight
is drawn at full strength in its own colour while everything it does not touch
fades back — one flow at a time is how you walk a room through a diagram's
traffic. The chip at the bottom right says which flow is lit and how long a
message takes; pausing flows in the toolbar pauses them here too.

## Presenting

The 3D view works in presentation mode (`P`): the presentation controls gain a **3D** switch and a turntable, the planes legend
stays up as a key to the stack, and `←` / `→` still step through the flows.
Nothing can be edited or moved, and the gizmo is gone — a click on a node
flies to it instead, which is the way to say "this one" to a room.

## In the file

Four optional keys, all ignored by the 2D canvas:

```json
{
  "planes": [
    { "id": "data", "label": "Data tier", "color": "green" },
    { "id": "application", "label": "Application tier", "color": "blue" },
    { "id": "dmz", "label": "DMZ", "color": "amber" }
  ],
  "nodes": [
    { "id": "core", "kind": "zone", "label": "Core", "plane": "application", "position3d": { "x": 900, "y": -40, "z": 60 } },
    { "id": "ledger", "label": "Ledger", "parent": "core", "plane": "data", "extrusion": "tower" }
  ]
}
```

`position3d` is only written once a node has been moved in 3D. Unlike
`position` it is never relative to the zone: `x` and `y` are absolute canvas
units and `z` is the height above the node's plane, so nothing done on the
canvas can move a node that was placed in 3D. Here `core` was moved in 3D and
`ledger`, which was not, rides along inside it.

See [the file format](./file-format) for the rules.
