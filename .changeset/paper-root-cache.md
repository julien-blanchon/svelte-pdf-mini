---
'svelte-pdf-mini': minor
---

`Paper.Root` takes `cache` (a `KeyValueStore`, e.g. `indexedDbStore('my-app', 'papers')`: a paper opened again isn't analyzed again) and `isolate`. Files over 32 MB are analyzed on the rendering worker instead of a second copy (not parsed twice).
