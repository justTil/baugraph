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

## Adding the current release

```
./test.sh --new
```

Creates `tests/fixtures/<version.txt>/` by copying the newest existing release's
fixtures forward, then runs the suite. The older directories stay — backward
compatibility across releases is the whole point.
