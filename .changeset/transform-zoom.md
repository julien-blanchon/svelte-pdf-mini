---
'svelte-pdf-mini': minor
---

Zoom gestures (pinch, Ctrl/⌘ + wheel, animated zooms) show as a CSS transform of the pages while they run, then lay out and draw once at the end, keeping the point under the gesture in place: 60 fps instead of ~35 on a 99-page paper in WKWebView. `transformZoom` (default true) turns it off.
