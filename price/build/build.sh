#!/bin/bash
# Пересборка «Маркетинговый анализ Price.html» из исходного бандла + расширений.
# Требуется Node.js >= 18. Патчи привязаны к форматированию prettier@3.3.3.
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
sed -n '6,31p' original.html | sed '1s/^<script type="module">//' > "$TMP/app.js"
npx --yes prettier@3.3.3 --parser babel "$TMP/app.js" > "$TMP/app.pretty.js"
cat ext-backend.js ext-ui.js > "$TMP/ext.js"
node patch.cjs "$TMP/app.pretty.js" "$TMP/ext.js" "$TMP/app.mod.js"
OUT="../Маркетинговый анализ Price.html"
{
  sed -n '1,3p' original.html
  echo "<style>"; cat ext.css; echo "</style>"
  sed -n '4,5p' original.html
  printf '<script type="module">'
  cat "$TMP/app.mod.js"
  echo "</script>"
  sed -n '33,34p' original.html
} > "$OUT"
rm -rf "$TMP"
echo "Готово: $OUT"
