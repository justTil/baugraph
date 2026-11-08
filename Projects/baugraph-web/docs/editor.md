# The editor

Drag a node from the palette in the sidebar onto the canvas, or click one to
drop it in the centre. Double-click a node to rename it inline; everything
else — icon, colour, shape, routing, arrowheads, line style — lives in the
inspector.

## Connecting nodes

Hover a node to reveal its connection dots — one to a side, until you add
more — and drag a dot onto another node to connect them. Neither end takes
any aiming: a dot's grab zone is far wider than the dot, and a drag released
anywhere near another node's side lands on it. The connection always runs the
way it was drawn, from the node the drag started on to the node it ended on;
release it over empty canvas and nothing is created.

### Connection points

A side starts with one connection point, in the middle, and can be given up
to six. Set the count per side in the inspector's **Connection points**
field: six down the right flank and one everywhere else is the shape a
fan-out actually has, so a topic with six subscribers stops drawing six lines
out of a single dot.

Points spread themselves evenly along the side they sit on — three sit at a
quarter, a half and three quarters of its length — which means nothing has to
be dragged into place and they stay evenly spread as the node is resized.
Drag from the one you want, or move a connection between them with the point
picker under **From side** / **To side** in a connection's inspector. An end
left on **Auto** picks the nearest point for itself.

Take points away again and anything attached past the end moves onto the
last point that is left, so a connection never comes adrift from the node it
belongs to.

### Moving a connection point

Even spacing is not always what a diagram needs — a database whose one
connection should leave from near the top, or a dot that should line up with
a node beside it. Hold `Shift` and drag a dot to slide it along its side; the
connections on it move with it. It snaps to the grid (when the grid is on),
to the middle of the side, and to its own evenly spread place — let go there
and it is back to spreading itself evenly, as if it had never been moved.
Hold `⌥` as well to place it freely.

A moved point keeps its place relative to the side, so it stays proportionally
where it was when the node is resized. The points that were not moved keep
spreading themselves evenly as points are added or taken away. **Respread
connection points**, in the inspector or a node's right-click menu, puts
every moved point back.

### Moving a label

A connection's label sits in the middle of its line until you drag it
somewhere else — along the line, towards either end, or off the line
altogether. It is stored as a place along the line plus how far off it, so
it stays with its connection, at the same end and on the same side, when the
nodes are moved. A label pulled off the line keeps a dotted thread back to
the point it belongs to — on the canvas and in exports.

Drop it back on the line and it sits on the line; drop it on the middle and
it is back where it started. Double-click a moved label — or use
**Recentre label** in the right-click menu, or **Recentre** in the inspector —
to put it back. `⌥` while dragging places it freely, without either pull.

### Rerouting a connection

Every connection routes itself around the nodes in its way until you take
over. Select one and handles appear on it — drag them to reshape the line;
there is no mode to switch on first.

- **Orthogonal lines** carry a small bar in the middle of each leg. Drag it
  and the leg moves sideways, taking the corners at both of its ends with
  it, so the line stays right-angled. Drag the leg that leaves a node and the
  end slides along that side of the node to follow; past the end of the
  side — or on a round outline, which has no straight side to slide along —
  a short jog is put in next to the node instead. Snaps to the grid when the
  grid is on; `⌥` places it freely. Drop a leg in line with its neighbour
  and the two merge.
- **Straight and curved lines** carry a dashed dot in the middle of each
  stretch. Drag it to pull a new bend point out of the line there.
- **Anywhere:** `⇧`-drag the line itself to drop a bend point exactly where
  you grabbed it. Drag a bend point to move it, double-click (or
  right-click) it to remove it, `⇧`-click several to align them.

The first drag turns the route into bend points starting from the line
exactly as it was drawn, so nothing jumps. From then on the connection is
*manual*: it goes where you put it and no longer detours around nodes.

To hand a connection back to the router, use **Reset to automatic route** in
its inspector or its right-click menu, or press `⌥⇧R`. With several things
selected, `⌥⇧R` and **Reset routing** reset every selected connection and
every connection between selected nodes; **Reset every connection's route**
on the empty canvas's menu resets the whole diagram. All of it can be undone.

## What a node is, and what it runs on

Every node carries two things beyond its name, and both are drawn on it:

- its **type** — `Database`, `API Gateway`, `Message Broker` — which stays
  put through a rename. Call a database "Orders" and the node still says
  `Database` underneath, so nobody has to remember what a cylinder or an icon
  meant.
- its **technology** — `PostgreSQL`, `IBM DB2`, `Apache Kafka`, `TIBCO EMS` —
  shown right after the type, in the node's own colour. It is the line a
  screenshot has to carry, so it is on the node rather than buried in a
  panel.

Both are picked in the inspector (or from a node's right-click menu) out of
searchable catalogues: ~150 node types and ~420 technologies grouped by what
they are — databases, message brokers, integration and ESB, caches, clouds,
CI/CD, identity, observability — plus industry packs for banking and payments,
telco, insurance, healthcare, retail and manufacturing. The packs sit folded in
their own **Industries** section of the palette, and each can be hidden in
Settings. The palette's own technology groups are the
shortcut: drag `Apache Kafka` straight onto the canvas and you get an amber
queue that is already a topic running Kafka.

The caption never repeats the name. A node called "PostgreSQL" reads
`PostgreSQL` / `Database`; rename it to "Orders" and it reads `Orders` /
`Database · PostgreSQL`. Either way the canvas says what it is.

## Sizing

A node is as big as what it carries. It arrives at the size its label,
caption and icon actually measure — a cylinder taller than a box, because its
caps eat the room a database's two lines need — and a rename or a new
technology grows the box instead of cutting the text off. A size set by hand
is never taken away again: the box only ever grows to fit.

To set one by hand, select the node and drag a side — the whole edge is the
handle, so width, the thing a diagram gets tidied with most, takes no
aiming. Pulling a zone's left or top edge in moves only that edge: what is
inside the zone stays exactly where it is on the canvas.

A node can be pulled thinner than the size it arrived at — down to what its
text needs, with a few pixels to spare — for a row of slim bars or a label
that should not take up a whole box. Width still stops where the caption
would be cut off.

`⇧⌘F` hands the decision back: it sizes the selection to its own text, wraps
a selected zone around its contents, and with nothing selected does the lot —
how an older diagram full of clipped captions gets fixed in one keystroke.

## Zones

Select several nodes and press `⌘G` to wrap them in a labelled zone — a VPC,
a cluster, a bounded context. The nodes become children of the zone, so
moving it moves them. Dropping a node onto a zone (from the palette, or by
dragging one across the canvas) groups it there too, and dragging it clear
releases it again; either way the grouping is written to the file as
`parent`. Zones nest, so a cluster can live inside a region.

## Locking

Lock a node or zone with `⇧⌘L` and it drops out of reach — not selectable,
not draggable, not connectable — which is what makes rearranging the
contents of a zone bearable. A locked node carries a small lock badge;
clicking it unlocks that node again, and the inspector can unlock everything
at once.

## Layers

The **Layers** tab on the left edge of the canvas opens a list of every node
in the diagram, nested the way its zones nest. It is the quick way around a
diagram too big to read at a glance:

- **Click** a row to select that node; `⌘`- or `⇧`-click adds it to the
  selection. **Double-click** it, or use its locate button, to bring it into
  view.
- **Hover** a row to lock or unlock it. Clicking a locked node's row shows
  you where it is, since a locked node cannot be selected.
- **Drag** rows to regroup them. Drop onto a zone to move into it, onto
  another node to join the zone that node is in, or onto empty space to take
  it out of every zone. A node that doesn't already sit inside its new zone
  is set down under the zone's contents, and the zone grows to fit; one taken
  out is set down just clear of it. Either way, the canvas ends up matching
  the list.
- **Search** by name, type, technology or id.

## Everyday editing

Copy/paste, undo/redo, multi-select, alignment and snapping while dragging
are all built in, along with a Monaco-based JSON editor for viewing or
hand-editing a diagram's underlying file. See [Keyboard shortcuts](/shortcuts)
for the full list.
