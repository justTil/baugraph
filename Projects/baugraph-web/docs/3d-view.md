# The 3D view

Press `3` — or **3D** in the toolbar, or in the switch at the top right of the
canvas — and the diagram stands up. It is exactly the layout of the canvas:
every node where it is there, the same diagram looked at from an angle.

The nodes stand up facing the front, each as the solid its shape is a drawing
of: a database is a drum, a queue a tube on its side with its slots as bands
round it, a pill a capsule, a circle a ball, and a box, a rounded box, a
hexagon or a diamond its outline made deep — a rounded box with its edges
rounded too. A note stays a sheet of paper with its corner turned down. The
name, type and icon are laid on the front — on a ball, a tube or a capsule
printed straight onto the curve, like a decal, so the icon and the text stay
upright — and read the way they do on the canvas. Zones are floors with low
glass walls around what they hold. The nodes stay standing whichever way the
view is turned.

The 3D view is for looking. Nothing is moved, selected or edited there, and
it changes nothing about the diagram: the 2D canvas and every export ignore
it, and the view itself — on or off, the camera, the spotlight — is never
saved, so a diagram always opens flat.

## Messages, from top to top

Every connection is an arch: out of the top of the node it leaves, over, and
down into the top of the node it reaches, leaving and arriving at the same
slant. The farther apart two nodes stand, the higher the arch rises, so it
clears what stands in between. Each connection meets a node at its own spot on
its top, on the side facing the other end, so a node that talks to many — a
gateway, a topic, a database everyone writes to — reads at a glance as a hub
with its spokes. Two connections between the same two nodes, a request and its
reply, run apart from end to end so both can be followed. Dashed and dotted
connections are drawn with longer dashes than on the canvas, which from across
the diagram would shrink into a fizz.

[Message flows](./message-flows) travel along the arches exactly as they run
across the canvas: the same hops, the same timing, the same split where a path
forks. Messages travel as what the flow says they are. A dot is a bead of
light; a **packet** is a parcel, taped down the middle, and an **envelope** a
letter with its flap folded down — drawn like the canvas's glyphs on every
side, in the flow's colour, standing upright and turned to face you. A
connection the flow styles differently changes the message as it passes, the
same as on the canvas: an envelope can become a red packet on the way to a
dead-letter queue. Where a message drops into a node, a ripple in its colour
marks the landing.

`←` and `→` step a **spotlight** through the flows. The one in the spotlight
is drawn at full strength in its own colour while everything it does not touch
fades back — one flow at a time is how you walk a room through a diagram's
traffic. The chip at the bottom right says which flow is lit and how long a
message takes; pausing flows in the toolbar pauses them here too.

## Height

The one thing a node carries for the 3D view is how tall it stands. A node's
inspector has a **3D height** section, and a selection of several sets them
all at once:

- *Low* and *Regular* stand on the floor, *Low* the thinner of the two.
- *Tall* and *Tower* stand on a post, high over the rest — for what matters
  at a glance: the database that carries the load, the gateway everything
  depends on.
- *Flat* does not stand at all — the node lies on its back, the way a floor
  marking does.

## Getting around

| Input | Does |
| --- | --- |
| Drag, or middle-drag | Orbit |
| Right-drag, or `⇧` middle-drag | Pan |
| Scroll | Zoom |
| Click a node | Fly to it |
| Double-click empty space | Fit everything |
| `F` | Fit everything |
| `R` | Turntable — a slow spin, for leaving a diagram on screen |
| `←` / `→` | Spotlight the previous / next message flow |
| `3` | Back to 2D |

The editing keys do nothing in the 3D view — there is nothing selected there
to act on. `⌘Z` and `⇧⌘Z` still undo and redo, for an edit made in the
inspector beside it.

The bar at the bottom left switches between an angled view, the view from
above (the 2D layout as a plan, the arches spread over it) and the view from
the front (every node face on, the arches over them), fits everything, turns connection
labels on and off, starts the turntable, and saves the current view as a PNG.

## Presenting

The 3D view works in presentation mode (`P`): the presentation controls gain a
**3D** switch and a turntable, and `←` / `→` still step through the flows. A
click on a node flies to it, which is the way to say "this one" to a room.

## In the file

One optional key on a node, ignored by the 2D canvas and every export:

```json
{ "id": "ledger", "label": "Ledger", "shape": "cylinder", "extrusion": "tower" }
```

`extrusion` is one of `flat`, `low`, `regular`, `tall` and `tower`; omitted, it
is `regular`. Where a node stands in 3D is never written down — it is where its
`position` puts it. See [the file format](./file-format) for the rules.
