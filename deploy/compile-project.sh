#!/bin/sh
set -eu
umask 077
case "$1" in
  pdflatex) engine=-pdf ;;
  xelatex) engine=-xelatex ;;
  lualatex) engine=-lualatex ;;
  *) echo 'Unsupported compiler' >&2; exit 1 ;;
esac
cat > /tmp/source.zip
unzip -q /tmp/source.zip -d /work
cd /work
set +e
latexmk -norc "$engine" -interaction=nonstopmode -halt-on-error -file-line-error -no-shell-escape "$2" > /tmp/compiler.log 2>&1
compile_status=$?
set -e
result_dir=/tmp/result
mkdir "$result_dir"
printf '%s' "$compile_status" > "$result_dir/status"
tail -c 300000 /tmp/compiler.log > "$result_dir/compile.log"
root_name=${2##*/}
pdf_name=${root_name%.tex}.pdf
if [ "$compile_status" -eq 0 ] && [ -f "$pdf_name" ]; then
  cp "$pdf_name" "$result_dir/output.pdf"
fi
cd "$result_dir"
zip -q -j - ./*
