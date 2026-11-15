#!/usr/bin/env bash
set -euo pipefail
command -v ollama >/dev/null || { echo 'Instala Ollama desde https://ollama.com/download y ejecuta ollama serve.' >&2; exit 1; }
ollama list >/dev/null
if ollama show cerca-planner:9b >/dev/null 2>&1; then
  echo 'Planificador ya disponible.'
elif ollama show cerca-decision:9b >/dev/null 2>&1; then
  ollama cp cerca-decision:9b cerca-planner:9b
elif ollama show qwen3.5:latest 2>/dev/null | grep -q '9.0B'; then
  ollama cp qwen3.5:latest cerca-planner:9b
else
  ollama pull qwen3.5:9b
  ollama cp qwen3.5:9b cerca-planner:9b
fi
ollama pull nimble:9b-q4_K_M
ollama pull qwen3-embedding:0.6b
node scripts/model-status.js
