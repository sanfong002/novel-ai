# ── Stage 1: Download tinyllama model ────────────────────────────────────────
# แยก stage เพื่อ cache model layer ไว้ ไม่ต้อง download ซ้ำทุก build
FROM ollama/ollama:latest AS model-downloader

RUN ollama serve & \
    sleep 5 && \
    ollama pull tinyllama && \
    pkill ollama || true

# ── Stage 2: Final image ──────────────────────────────────────────────────────
FROM ollama/ollama:latest

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy pre-pulled model from stage 1
COPY --from=model-downloader /root/.ollama /root/.ollama

WORKDIR /app

# Install Node dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy app source
COPY server.js ./
COPY index.html ./
COPY public ./public

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Render uses $PORT (default 3000)
EXPOSE 3000

# Start both Ollama and Node
CMD ["./start.sh"]
