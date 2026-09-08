#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/native/versions.env"
DEST="$ROOT/native/third_party"
mkdir -p "$DEST"

clone_pin() {
  local name="$1" repo="$2" ref="$3"
  local dir="$DEST/$name"
  if [[ -d "$dir/.git" ]]; then
    echo "$name already exists at $dir; leaving it untouched."
    return
  fi
  echo "Fetching $name @ $ref"
  git clone --depth 1 --branch "$ref" "$repo" "$dir"
  git -C "$dir" rev-parse HEAD
}

clone_pin whisper.cpp "$WHISPER_CPP_REPO" "$WHISPER_CPP_REF"
clone_pin llama.cpp "$LLAMA_CPP_REPO" "$LLAMA_CPP_REF"
clone_pin sherpa-onnx "$SHERPA_ONNX_REPO" "$SHERPA_ONNX_REF"
clone_pin silero-vad "$SILERO_VAD_REPO" "$SILERO_VAD_REF"

echo "Native sources fetched under native/third_party (gitignored)."
echo "No model weights were downloaded."
