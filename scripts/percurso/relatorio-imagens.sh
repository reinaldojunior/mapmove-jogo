#!/bin/sh
# Gera as imagens do relatório da etapa 2 (docs/percursos/etapa2/img). Antes: dados/casados e dados/elevacao gerados
# (casar.mjs e elevacao.py). Cada imagem: python3 conferir.py ... <km do GPS> <raio> ... antes|depois
set -e
cd "$(dirname "$0")/../.."
SAI=docs/percursos/etapa2/img; mkdir -p $SAI; TMP=$(mktemp -d)
img() { # slug prefixo rótulo km raio nome modo
  python3 scripts/percurso/conferir.py dados/percursos/$1.json dados/grafos/$1.json $3 $4 $5 $TMP/x.png dados/elevacao/$1.json dados/casados/$1.json $7 >/dev/null
  python3 -c "from PIL import Image; Image.open('$TMP/x.png').convert('RGB').save('$SAI/$2-$6-$7.jpg', quality=82)"
}
SO=9-maratona-sorocaba-novembro-azul-2026-11-21; IN=1-meia-maratona-de-indaiatuba-2026-12-13
for m in antes depois; do
  img $SO s21 21K -1 0 geral $m;     img $SO s21 21K 1.3 160 retorno-largada $m;  img $SO s21 21K 19.9 200 ponte $m
  img $SO s42 42K -1 0 geral $m;     img $SO s42 42K 0.45 300 largada $m;         img $SO s42 42K 19.2 230 ponte-volta1 $m
  img $SO s42 42K 39.9 230 ponte-volta2 $m
  img $IN i06 6K -1 0 geral $m;      img $IN i10 10K -1 0 geral $m;               img $IN i10 10K 3.19 150 km3 $m
  img $IN i21 21K -1 0 geral $m
done
rm -rf $TMP; ls -la $SAI | tail -n +2 | awk '{s+=$5} END {print NR " imagens, " int(s/1024) " KB"}'
