# ── Stage 1: ดึง Ollama binary ───────────────────────────────────────────────
FROM ollama/ollama:latest AS ollama-bin

# ── Stage 2: ดึง tinyllama model ─────────────────────────────────────────────
FROM ollama/ollama:latest AS model-downloader
RUN ollama serve & \
    sleep 8 && \
    ollama pull tinyllama && \
    pkill ollama || true

# ── Stage 3: Final — Node.js image + Ollama binary วางทับ ───────────────────
FROM node:20-slim

# คัดลอก Ollama binary จาก official image โดยตรง (ไม่ต้อง curl)
COPY --from=ollama-bin /usr/bin/ollama /usr/bin/ollama

# คัดลอก model ที่ pull ไว้แล้ว
COPY --from=model-downloader /root/.ollama /root/.ollama

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY index.html ./
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

# Node image ใช้ bash เป็น default shell — ไม่มี ollama entrypoint ยุ่ง
CMD ["/bin/bash", "./start.sh"]