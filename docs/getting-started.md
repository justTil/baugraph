# Getting started

Baugraph is a browser-based diagram editor for architecture diagrams — flows,
queues, integrations. Diagrams are stored as plain `.baugraph.json` files
meant to be committed next to the code they describe.

Open [baugraph.com](https://baugraph.com) and start dragging nodes onto the
canvas — nothing to install, nothing uploaded. The current diagram autosaves
to `localStorage`, so a reload never loses work, but that copy is a
convenience, not the source of truth: export the JSON and commit it.

## Running it yourself

```sh
git clone https://github.com/justTil/baugraph
cd baugraph
npm install
npm run dev
```

Then open `http://localhost:5173`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check, build the app, build these docs — all into `dist/` |
| `npm run type-check` | `vue-tsc` only |
| `npm run generate` | Regenerate the JSON Schema and the icon registry |
| `./build.sh` | Clean install + type-check + production build |
| `./manage.sh start [PORT]` | Serve `dist/` behind a load balancer |

## Self-hosting

Baugraph ships a `Dockerfile` that builds the app and serves it from nginx.
The self-hosted variant drops the operator-specific Impressum/Legal links
(those only apply to the baugraph.com deployment) and shows a
"self-hosted" marker instead:

```sh
docker build --build-arg SELF_HOSTED=true -t baugraph .
docker run -p 8080:80 baugraph
```

## Where to go next

- [The editor](/editor) — nodes, connections, sizing, zones.
- [Message flows](/message-flows) — animating a message through a diagram.
- [Exporting](/exports) — SVG, PNG and the JSON file itself.
- [The .baugraph.json format](/file-format) — the on-disk shape, for hand-editing or tooling.
