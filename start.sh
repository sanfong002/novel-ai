#!/bin/bash
set -e

echo "🟡 Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

# Wait until Ollama is ready (max 30s)
echo "⏳ Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Ollama failed to start after 30s"
    exit 1
  fi
  sleep 1
done

# Verify tinyllama is available
echo "🧠 Checking tinyllama model..."
if ollama list | grep -q "tinyllama"; then
  echo "✅ tinyllama ready"
else
  echo "⚠️  tinyllama not found, pulling now..."
  ollama pull tinyllama
fi

echo "🕯️  Starting Node.js app..."
exec node server.js
