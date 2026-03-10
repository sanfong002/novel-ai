# 🕯️ Ratchabutr Mansion — Docker Edition
Horror/Mystery chatbot ที่รัน Ollama (tinyllama) + Node.js ใน Docker container เดียว

## โครงสร้างไฟล์
```
├── Dockerfile        # build image รวม Ollama + Node + tinyllama model
├── start.sh          # script เริ่ม Ollama แล้วตามด้วย Node
├── server.js         # Express API server
├── index.html        # Frontend
├── render.yaml       # Render deploy config
└── package.json
```

## Deploy บน Render ผ่าน GitHub

### 1. Push ขึ้น GitHub
```bash
git init
git add .
git commit -m "feat: docker with tinyllama"
git remote add origin https://github.com/YOUR_USERNAME/horror-chatbot.git
git push -u origin main
```

### 2. สร้าง Web Service บน Render
1. render.com → New + → Web Service
2. เชื่อม GitHub repo
3. Runtime: Docker, Dockerfile Path: ./Dockerfile
4. Deploy — รอ 10-15 นาที (ครั้งแรก build + download model)

### 3. ตรวจสอบ
เปิด https://your-app.onrender.com/health ควรเห็น:
{"status":"ok","model":"tinyllama","models_available":["tinyllama:latest"]}

## รัน Local
```bash
docker build -t horror-chatbot .
docker run -p 3000:3000 horror-chatbot
```

## ข้อแนะนำ Render Plan
- Free (512MB RAM): ใช้ qwen2:0.5b (352MB) แทน
- Starter $7/mo (1GB RAM): tinyllama ทำงานได้สบาย
