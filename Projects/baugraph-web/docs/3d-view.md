# The 3D view

Press `3` — or **3D** in the toolbar, or in the switch at the top right of the
canvas — and the diagram stands up in layers. Every node keeps exactly the
place it has on the 2D canvas and is only lifted onto the *plane* it belongs
to. Nothing is laid out again, so the 3D view is never a second arrangement of
the diagram that could drift from the first: it is the same diagram, looked at
with a height axis added.

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

Planes are the 3D view's layers. (The **Layers** tab on the 2D canvas is
something else: the list of every node, nested by zone.)

With nothing selected, the inspector's **3D planes** section lists the stack
top to bottom. **Add plane** names a new one and puts it on top; each plane can
be renamed, recoloured, raised, lowered or deleted there. The first plane is
the ground: anything that does not say otherwise stands on it.

The 3D view has the same list as a legend in its top-left corner. Click a
plane's name to fly to it, hide it from the view with the eye (the diagram is
not changed), or — with nodes selected — put the whole selection on it with
the arrow.

## Putting nodes on planes

A node's inspector has a **3D** section — at the top while the 3D view is on,
at the bottom otherwise:

- **Plane** — which plane the node stands on. **Auto** follows its zone, so
  putting a zone on a plane takes everything inside it along; a node with no
  zone stands on the ground. Pick a plane to set one node apart from its zone.
- **Height** — *Flat*, *Low*, *Regular*, *Tall* or *Tower*. Use it to say
  what matters at a glance: the database that carries the load, the gateway
  everything depends on.

Select several nodes and the same section sets them all at once. In the 3D
view, `↑` and `↓` move the selection one plane up or down — the quickest way
to build a stack is to click through a diagram pressing arrows.

## Getting around

| Input | Does |
| --- | --- |
| Drag | Orbit |
| Right-drag | Pan |
| Scroll | Zoom |
| Click / `⇧`-click | Select / add to the selection — the same selection as the canvas |
| Double-click | Fly to a node; on empty space, fit everything |
| `F` | Fit the stack |
| `R` | Turntable — a slow spin, for leaving a diagram on screen |
| `↑` / `↓` | Move the selection one plane up / down |
| `←` / `→` | Spotlight the previous / next message flow |
| `3` | Back to 2D |

The bar at the bottom left switches between an angled view, the view from
above (the 2D layout, from the top) and the view from the side (the stack
itself, every boundary crossing a vertical line). **Spread** pulls the planes
apart or lays them flat on each other, and the camera button saves the
current view as a PNG.

## Message flows in 3D

[Message flows](./message-flows) run through the stack exactly as they run
across the canvas: the same hops, the same timing, the same split where a path
forks. A connection within a plane keeps the route the canvas draws for it; one
between planes is a cable from one floor to the next, so a message visibly
leaves its zone.

`←` and `→` step a **spotlight** through the flows. The one in the spotlight
is drawn at full strength in its own colour while everything it does not touch
fades back — one flow at a time is how you walk a room through a diagram's
traffic. The chip at the bottom right says which flow is lit and how long a
message takes; pausing flows in the toolbar pauses them here too.

## Presenting

The 3D view works in presentation mode (`P`): the presentation controls gain a **3D** switch and a turntable, the planes legend
stays up as a key to the stack, and `←` / `→` still step through the flows.
Nothing can be edited — a click on a node flies to it instead, which is the
way to say "this one" to a room.

## In the file

Three optional keys, all ignored by the 2D canvas:

```json
{
  "planes": [
    { "id": "data", "label": "Data tier", "color": "green" },
    { "id": "application", "label": "Application tier", "color": "blue" },
    { "id": "dmz", "label": "DMZ", "color": "amber" }
  ],
  "nodes": [
    { "id": "core", "kind": "zone", "label": "Core", "plane": "application" },
    { "id": "ledger", "label": "Ledger", "parent": "core", "plane": "data", "extrusion": "tower" }
  ]
}
```

See [the file format](./file-format) for the rules.
