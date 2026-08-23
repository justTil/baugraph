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
searchable catalogues: ~90 node types and ~250 technologies grouped by what
they are — databases, message brokers, integration and ESB, caches, clouds,
CI/CD, identity, observability. The palette's own technology groups are the
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

## Everyday editing

Copy/paste, undo/redo, multi-select, alignment and snapping while dragging
are all built in, along with a Monaco-based JSON editor for viewing or
hand-editing a diagram's underlying file. See [Keyboard shortcuts](/shortcuts)
for the full list.
