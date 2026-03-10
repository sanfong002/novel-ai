#!/bin/bash
set -e

echo "🟡 Starting Ollama server..."
OLLAMA_HOST=0.0.0.0:11434 ollama serve &

# ใช้ /proc/net/tcp แทน curl (node:20-slim ไม่มี curl)
# รอจนกว่า port 11434 จะเปิด (hex: 2C7A = 11386? ไม่ใช่ — ใช้ node แทน)
echo "⏳ Waiting for Ollama on port 11434..."
node - << 'JSEOF'
const net = require('net');
const MAX = 40;
let attempts = 0;
function tryConnect() {
  const sock = net.createConnection({ port: 11434, host: '127.0.0.1' });
  sock.on('connect', () => { sock.destroy(); console.log('✅ Ollama is ready'); });
  sock.on('error', () => {
    sock.destroy();
    attempts++;
    if (attempts >= MAX) { console.error('❌ Ollama not ready after 40s'); process.exit(1); }
    setTimeout(tryConnect, 1000);
  });
}
tryConnect();
JSEOF

echo "🧠 Verifying tinyllama..."
ollama list

echo "🕯️  Starting Node.js app..."
exec node server.js