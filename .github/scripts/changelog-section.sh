#!/bin/sh
# Print the body of the `## <version>` section of a Changesets CHANGELOG.md
# (everything up to the next `## ` heading). Prints nothing if absent.
# Usage: .github/scripts/changelog-section.sh <version> [CHANGELOG.md]
set -eu
VERSION=$1
FILE=${2:-packages/svelte-pdf-mini/CHANGELOG.md}
[ -f "$FILE" ] || exit 0
awk -v v="## $VERSION" '
  $0 == v { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$FILE" | sed -e '/./,$!d'
