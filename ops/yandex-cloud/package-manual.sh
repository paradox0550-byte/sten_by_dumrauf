#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

command -v node >/dev/null || { echo "ERROR: Node.js 22 is required" >&2; exit 1; }
command -v npm >/dev/null || { echo "ERROR: npm is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "ERROR: Python 3.12 is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "ERROR: zip is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "ERROR: sha256sum is required" >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
python_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
test "$node_major" = "22" || { echo "ERROR: expected Node.js 22, got $(node --version)" >&2; exit 1; }
test "$python_version" = "3.12" || { echo "ERROR: expected Python 3.12, got $python_version" >&2; exit 1; }

package_version="$(node -p "require('./backend/package.json').version")"
test "$package_version" = "5.4.1" || { echo "ERROR: expected Backend package 5.4.1, got $package_version" >&2; exit 1; }

SOURCE_COMMIT="${SOURCE_COMMIT:-${GITHUB_SHA:-}}"
if [[ -z "$SOURCE_COMMIT" ]] && git rev-parse --verify HEAD >/dev/null 2>&1; then
  SOURCE_COMMIT="$(git rev-parse HEAD)"
fi
if [[ -z "$SOURCE_COMMIT" ]]; then
  echo "ERROR: set SOURCE_COMMIT to the reviewed Git commit SHA when building from a source archive." >&2
  exit 1
fi
SOURCE_REF="${SOURCE_REF:-${GITHUB_REF:-$(git branch --show-current 2>/dev/null || true)}}"

OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/release-artifacts/yandex-cloud}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR" "$TMP_DIR/backend" "$TMP_DIR/markitdown"

echo "Installing locked Backend dependencies..."
npm ci --prefix backend --ignore-scripts
echo "Running Backend tests..."
npm test --prefix backend
node --check backend/index.js

echo "Validating MarkItDown source..."
test -f backend/markitdown/function.py
test -f backend/markitdown/requirements.txt
grep -qx 'markitdown[all]==0.1.8' backend/markitdown/requirements.txt
python3 -m py_compile backend/markitdown/function.py

tar -C backend \
  --exclude='./node_modules' \
  --exclude='./tests' \
  --exclude='./markitdown' \
  -cf - . | tar -C "$TMP_DIR/backend" -xf -
test -f "$TMP_DIR/backend/index.js"
test -f "$TMP_DIR/backend/package.json"
test -f "$TMP_DIR/backend/package-lock.json"
test ! -e "$TMP_DIR/backend/markitdown"
test ! -e "$TMP_DIR/backend/node_modules"

cp backend/markitdown/function.py backend/markitdown/requirements.txt "$TMP_DIR/markitdown/"

backend_archive="sten-backend-node22-$SOURCE_COMMIT.zip"
markitdown_archive="sten-markitdown-python312-$SOURCE_COMMIT.zip"
(cd "$TMP_DIR/backend" && zip -qr "$OUTPUT_DIR/$backend_archive" .)
(cd "$TMP_DIR/markitdown" && zip -qr "$OUTPUT_DIR/$markitdown_archive" .)
sha256sum "$OUTPUT_DIR/$backend_archive" > "$OUTPUT_DIR/$backend_archive.sha256"
sha256sum "$OUTPUT_DIR/$markitdown_archive" > "$OUTPUT_DIR/$markitdown_archive.sha256"

{
  echo "product=STEN Backend"
  echo "package_version=$package_version"
  echo "runtime=nodejs22"
  echo "entrypoint=index.handler"
  echo "source_commit=$SOURCE_COMMIT"
  echo "source_ref=$SOURCE_REF"
  echo "function_id=d4epijnhj7h9sd5ppa66"
  echo "gateway_id=d5d5p4eof6ra03bsva7a"
  echo "backend_archive=$backend_archive"
  echo "backend_archive_sha256=$(cut -d ' ' -f 1 "$OUTPUT_DIR/$backend_archive.sha256")"
  echo "contains_node_modules=false"
  echo "contains_python_markitdown=false"
  echo "secrets_included=false"
  echo "markitdown_function_id=d4e4ai8895c3kq3b0ds5"
  echo "markitdown_runtime=python312"
  echo "markitdown_entrypoint=function.handler"
  echo "markitdown_engine_version=0.1.8"
  echo "markitdown_archive=$markitdown_archive"
  echo "markitdown_archive_sha256=$(cut -d ' ' -f 1 "$OUTPUT_DIR/$markitdown_archive.sha256")"
  echo "built_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUTPUT_DIR/release-manifest.txt"

echo "Release files created in: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
