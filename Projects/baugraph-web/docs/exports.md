# Exporting

| Format | Use |
| --- | --- |
| `.baugraph.json` | The editable source — this is the one to commit |
| SVG | Vector, opaque or transparent background, message flows animated |
| PNG | Raster at 2× or 4× |

SVG and PNG are rendered by a standalone renderer that reuses the same
shape, routing and colour code as the canvas, so an export matches what is
on screen.

An exported SVG keeps its message flows: they are written as SMIL
(`animateMotion` along the connections' own paths), so the file animates on
its own in a browser with no script and no stylesheet. Because every hop of
a journey runs at one speed, distance along a route is proportional to time
along it, and a whole branch — fan-out included — collapses into a single
declarative animation. PNG leaves the flows out; a raster is one frame, and
one frame of an animation is not a picture of the diagram.

Everything happens in the browser; nothing is uploaded.

## Migration from the legacy tool

Exports from the original single-file `diagram-tool.html` are recognised by
their shape and converted on open — shapes, sides, routes and Bootstrap icon
names are all mapped across automatically.
