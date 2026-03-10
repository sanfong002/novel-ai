# ── Stage 1: Download tinyllama model ────────────────────────────────────────
FROM ollama/ollama:latest AS model-downloader

RUN ollama serve & \
    sleep 5 && \
    ollama pull tinyllama && \
    pkill ollama || true

# ── Stage 2: Final image ──────────────────────────────────────────────────────
FROM ubuntu:22.04

# Install Ollama + Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://ollama.com/install.sh | sh && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy pre-pulled model from stage 1
COPY --from=model-downloader /root/.ollama /root/.ollama

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY index.html ./
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

# ใช้ ENTRYPOINT เป็น bash โดยตรง ไม่ใช้ ollama เป็น entrypoint
ENTRYPOINT ["/bin/bash"]
CMD ["./start.sh"]