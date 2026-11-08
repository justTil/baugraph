# Schema fixtures

Real `.baugraph.json` documents, kept here so a change to the model can never
silently start rejecting (or accepting) files it used to handle.

## Layout

```
tests/fixtures/
  <release>/              e.g. 1.28.0 — the release version from version.txt,
                          NOT the format version in the file ("baugraph": "1.0")
    valid/                documents that MUST keep parsing
      *.json
    invalid/              documents that MUST keep being rejected
      *.json
    *.json                loose files here count as `valid/`
```

Directories are named after the **release** so a failing test names the release
where a document broke — `baugraph 1.28.0 > valid fixtures > … — parses`.

`tests/schema/fixtures.test.ts` walks this tree and, grouped by `<release>`:

- **valid** — every file must pass `safeParse` (the zod model, incl. `migrate()`
  and the cross-field checks) **and** validate against the currently published
  JSON Schema (`public/schema/baugraph-v*.schema.json`). Each file is also
  round-tripped through `stringify` → `parse` and must come back unchanged.
- **invalid** — every file must fail `safeParse`. Give it a filename that says
  what makes it invalid.

## Route goldens

A file that still *parses* can still be *drawn* differently. `tests/golden/`
holds what each release's connection router drew for every diagram here (and
the sample diagrams): `routes-<release>.json`, recorded from that release's
own `edge-path.ts` straight out of git:

```
npx vite-node tests/golden/generate-routes.ts <git-ref> <release>
npx vite-node tests/golden/generate-routes.ts 0a3c8e3 1.34.0
```

`tests/golden/routes.test.ts` holds today's router to it: automatic lines,
and manual straight and curved ones, must come out the same to the character;
manual orthogonal lines must stay square, run through every stored bend
point and keep their sides. Record a golden once a release ships, and never
regenerate an existing one to make a failing test pass — a failure there is a
diagram on someone's disk that moved.

## Adding the current release

```
./test.sh --new
```

Creates `tests/fixtures/<version.txt>/` by copying the newest existing release's
fixtures forward, then runs the suite. The older directories stay — backward
compatibility across releases is the whole point.
