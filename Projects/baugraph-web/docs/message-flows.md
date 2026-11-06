# Message flows

A diagram can show a message moving through it. Select the node it starts at
and press *Flow from …* in the inspector (or right-click → **Animate message
from here**), and a message travels every connection onwards —
**multiplying wherever the path forks**. One order published to a topic with
three subscribers is one envelope arriving and three leaving, which is the
move most middleware diagrams are drawn to explain and the one a still
picture cannot make.

Nothing about that split is authored. A flow stores only *which* connections
the message travels; the order the hops happen in, and where the message
multiplies, are read off the graph every time it runs. Adding a fourth
subscriber to a fan-out is one more id in `edges` — never a rewritten
timeline — and rerouting a connection or dragging a node keeps the animation
correct, because the messages follow the path that is actually on screen.
When the arrows don't tell the story you want, you can set the order
yourself — see [Changing the order](#changing-the-order).

## The flow editor

**Message flows** in the toolbar opens the editor in a panel under the
canvas, so the diagram stays in view while you work: the messages keep
moving above, and hovering a row in the editor lights up its connection on
the canvas. Drag the panel's top edge to give it more or less room. The same
toolbar button closes it.

It has three columns:

- **Flows** — every flow in the diagram, each with its own ▶ / ⏸ button.
  *New flow from selection* makes a flow from the connections selected on
  the canvas; because the editor doesn't cover the canvas, you can select
  them with it open.
- **The flow, as a sequence diagram** — every node the flow touches is a
  column with a lifeline under it, and every connection is a row with an
  arrow from the node it leaves to the node it reaches. Rows are grouped into
  numbered steps, top to bottom, in the order the message travels. While the
  flow runs, the messages travel these arrows in step with the canvas, and
  the step that is moving right now is highlighted.
- **Look & timing** — colour, how it's drawn, the message shape, whether it
  sends one event or constant traffic, speed, count and the gap between
  passes. On a narrow screen this slides over the sequence from the *Look*
  button instead of taking a column.

## Changing the order

The **Order** switch above the sequence has three settings:

- **Fan out** (the default) follows the arrows from where the message starts.
  Wherever a node feeds several connections, the message is copied onto all
  of them at once.
- **One by one** also follows the arrows, but a single message takes the
  connections one after another.
- **Custom** is your own order. Each step leaves once everything in the step
  before it has arrived, and the connections in one step travel at the same
  time.

You don't have to choose *Custom* first: rearranging anything switches to it,
starting from the order on screen. To rearrange:

- **Drag a row by its grip** (⋮⋮). Drop it *between* two steps to make it a
  step of its own there, or *onto* a step to send it at the same time as that
  step. The drop target is highlighted while you drag.
- **↑ / ↓** move a row one place earlier or later (`Alt+↑` / `Alt+↓` with the
  row focused). A row that shares its step is first lifted out to go just
  before or after it, so moving never quietly merges anything.
- **🔗** sends a row at the same time as the step above it.
- The **split** button beside a step of several sends them one after another
  instead.

*Automatic again* forgets the custom order and follows the arrows. The order
is about telling the story clearly, so a request and its reply read as one
message: a message that arrives at a node carries on from there in the next
step that leaves it, waiting at the node if another connection in its step
takes longer to arrive.

A connection added to a flow with a custom order joins it as the last step.

## Two rendering engines

A flow can use either or both:

- **Messages** — discrete tokens (dot, packet or envelope) travelling the
  line, driven by GSAP against the connection's own SVG path. Every hop moves
  at the same speed, so a long connection honestly takes longer than a short
  one, and branches out of a fork leave together.
- **Line** — a marching dash along the connection, the way a link under
  constant load reads. Pure CSS on an SVG stroke, so it costs nothing to
  leave running.

Set *Where the path forks* to **One by one** instead of **Multiply** and a
single message walks the connections in turn — a routing slip, or a
step-by-step walkthrough of a sequence.

## One connection at a time

A node's onward connections rarely mean the same thing: the one to a service
is the happy path, the one to a dead-letter queue is a failure. Click a row
in the flow editor and *Look & timing* shows a card for that connection
alone, with its own colour, message shape and speed — so the failure path can
be a red packet crawling while the rest are blue envelopes at full speed.

Every control there reads *same as the flow* until you touch it, and the
file records only what differs:

```json
"style": {
  "order-created--dead-letter-queue": { "color": "red", "token": "packet", "speed": 110 }
}
```

Selecting a **connection** on the canvas shows, in the inspector, the flows
running over it and which step of each it is. From there you can take it out
of a flow, add it to another one, or press *Edit* to open the editor on that
row — so if the two paths should be separate flows entirely rather than one
flow drawn two ways, that is a click as well.

## Constant traffic

*Sends* chooses what kind of thing the flow is. **An event** goes through
and leaves the line quiet until the next one. **Constantly** never stops:
messages leave one after another so the connection is never empty, which is
what a link under permanent load looks like. *In flight* then says how many
are on the way at once, and the gap no longer applies — there is nothing to
wait between.

The seam is not visible. A stream's clock is one departure apart rather than
one journey long, so as the first message drops back to the source the next
is already exactly where it was, and both ends of the swap are at zero
opacity.

## Pausing

The toolbar's *Pause flows* button freezes every flow where it is, which is
what you want while working *on* a diagram that animates. A single flow can
be paused with its own ⏸ button in the editor; its connections then show a
dashed **Flow paused** tag on the canvas, so a line that has stopped moving
says why. Hover the tag for an explanation, or click it to open the editor
on that flow — press ▶ *Run* there to start it again and the tag goes away.

A system asking for reduced motion is never animated at all: the messages
are shown parked on the connections they travel instead.
