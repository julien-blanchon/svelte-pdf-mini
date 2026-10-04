# Security policy

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/julien-blanchon/svelte-pdf-mini/security/advisories/new), not in public issues.

Include what is affected (version, component or API), how to reproduce it (ideally with a PDF or a minimal snippet), and the impact you expect. You'll get an answer within a few days.

Only the latest published version receives security fixes.

PDFs are untrusted input: svelte-pdf-mini renders them with pdf.js and sanitises annotation notes (Markdown) with DOMPurify. Issues in pdf.js itself should also be reported to [Mozilla](https://github.com/mozilla/pdf.js/security).
