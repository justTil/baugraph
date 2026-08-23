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
is the happy path, the one to a dead-letter queue is a failure. Select a
**connection** and the inspector shows the flows running over it, with the
colour, the message shape and the speed *for that connection alone* — so the
failure path can be a red packet crawling while the rest are blue envelopes
at full speed.

Every control there reads *same as the flow* until you touch it, and the
file records only what differs:

```json
"style": {
  "order-created--dead-letter-queue": { "color": "red", "token": "packet", "speed": 110 }
}
```

The same panel takes a connection out of a flow, or adds it to another one —
so if the two paths should be separate flows entirely rather than one flow
drawn two ways, that is a click as well.

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

Speed, colour, message shape, how many messages per pass and the gap before
it repeats are all in the inspector; hovering a flow there haloes the
connections it runs over. The toolbar's pause button freezes every flow
where it is, which is what you want while working *on* a diagram that
animates. A system asking for reduced motion is never animated at all: the
messages are shown parked on the connections they travel instead.
