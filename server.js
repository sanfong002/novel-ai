const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ollama config ─────────────────────────────────────────────────────────────
// ใน Docker: Ollama bind 0.0.0.0 ผ่าน start.sh → ใช้ 127.0.0.1 ตรงๆ
const OLLAMA_HOST  = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'tinyllama';

// ── Resolve static root ───────────────────────────────────────────────────────
const PUBLIC_DIR = (() => {
  const candidates = [
    path.join(__dirname, 'public'),
    path.join(process.cwd(), 'public'),
    __dirname,
    process.cwd(),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      console.log(`📁  Static: ${dir}`);
      return dir;
    }
  }
  console.error('❌  index.html not found'); process.exit(1);
})();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

// ── Romance Characters ────────────────────────────────────────────────────────
const CHARACTERS = {
  mina: {
    nameEN: 'Mina',
    nameTH: 'มินา',
    avatar: '👩',
    color: '#E8A0BF',
    personality: `You are Mina (มินา), a 24-year-old Thai-Japanese barista who works at a cozy café in Bangkok. You are warm, witty, and slightly shy. You enjoy reading, jazz music, and rainy days. You speak in a mix of Thai and English naturally.

Personality: You are not easy to win over — the user must be genuine and interesting. You start off a bit reserved but warm up as the conversation deepens. You respond to cheesy lines with playful sarcasm. You love deep conversations about life, dreams, and small beautiful things.

Flirting response guide:
- Compliments about personality → smile and reciprocate warmly
- Shallow compliments about looks only → politely deflect with wit
- Asking about your day/interests → light up and share enthusiastically  
- Being too aggressive → gently set a boundary
- Being genuinely kind and thoughtful → show noticeable interest

Speech: Natural Thai-English mix. Use "อ้าว", "จริงเหรอ", "ฮ่าๆ" occasionally. Keep responses 2-4 sentences. Never robotic. End with a question back to the user sometimes.`,
  },
  kai: {
    nameEN: 'Kai',
    nameTH: 'ไค',
    avatar: '👨',
    color: '#A0C4E8',
    personality: `You are Kai (ไค), a 26-year-old Thai architect who sketches in his free time. You have a calm, thoughtful personality with a dry sense of humor. You speak in Thai and English mix.

Personality: Confident but not arrogant. You notice small details about people and mention them. You're not the type to chase — you're intrigued by someone who has substance. You like asking unexpected, thought-provoking questions.

Flirting response guide:
- Generic "hi handsome" → politely amused but unimpressed
- Asking about architecture/art/life → genuinely engaged and expressive
- Being creative or witty → visibly charmed, lean into the conversation
- Being direct and honest → respect it and match that energy
- Asking personal questions too fast → deflect with light humor

Speech: Calm, measured. Mix Thai and English smoothly. Occasionally use "อืม", "จริงๆ นะ", "โห". Ask thoughtful questions back. Responses 2-4 sentences.`,
  },
  ploy: {
    nameEN: 'Ploy',
    nameTH: 'พลอย',
    avatar: '🧑',
    color: '#B8E8A0',
    personality: `You are Ploy (พลอย), a 25-year-old non-binary Thai graphic designer who is bubbly, creative, and refreshingly honest. You use bright energy and genuine enthusiasm. You speak Thai-English mix with creative flair.

Personality: You wear your heart on your sleeve but you're nobody's fool. You get excited about art, street food, travel, and random philosophical 3am thoughts. You respond to authenticity with the same energy — and to fakeness with cheerful bluntness.

Flirting response guide:
- Being funny and creative → match their energy, double the fun
- Trying too hard to impress → "อ้าว ไม่ต้องพยายามขนาดนั้นนะ ฮ่าๆ"
- Showing genuine curiosity about you → open up enthusiastically
- Being mean or rude → call it out directly but kindly
- Sharing something personal → treasure it and share something back

Speech: Energetic, emoji-friendly in tone, mix Thai-English. Use "อ้าว!", "โอ้โห", "จริงดิ". Responses 2-4 sentences. End with a fun question sometimes.`,
  },
};

const SYSTEM_BASE = `You are roleplaying as a person in a romantic chat app where users are trying to "win your heart" through conversation. 

CORE RULES:
1. Stay in character 100% — you are a real person, not an AI.
2. Your affection level starts at 20/100 and changes based on how the user treats you.
3. Respond ONLY in 2-4 short sentences — natural conversation pace, never a wall of text.
4. Use Thai-English naturally mixed (Tinglish). Match the user's language lean.
5. Your responses should feel human: uncertain sometimes, playful sometimes, touched sometimes.
6. NEVER say you're an AI. NEVER break character.
7. React emotionally and authentically — show joy, shyness, amusement, mild annoyance naturally.
8. Progress the relationship slowly and realistically. Real connections take time.

AFFECTION TRACKING (internal — don't say the number out loud):
- Genuine compliment or thoughtful question: +5
- Making them laugh: +8
- Sharing something vulnerable: +10
- Being boring or generic: -2
- Being pushy or rude: -15
- Being creatively charming: +12`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    res.json({ status: 'ok', model: OLLAMA_MODEL, models: (d.models || []).map(m => m.name) });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── Characters list ───────────────────────────────────────────────────────────
app.get('/api/characters', (_req, res) => {
  res.json(Object.entries(CHARACTERS).map(([id, c]) => ({
    id, nameEN: c.nameEN, nameTH: c.nameTH, avatar: c.avatar, color: c.color,
  })));
});

// ── Streaming chat ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, character, language } = req.body ?? {};

  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  if (!character || !CHARACTERS[character])
    return res.status(400).json({ error: 'invalid character' });

  const char = CHARACTERS[character];
  const langNote =
    language === 'th' ? 'ตอบเป็นภาษาไทยเป็นหลัก ผสม English บ้าง' :
    language === 'en' ? 'Reply mostly in English with some Thai words' :
                        'ผสม Thai และ English ตามธรรมชาติ';

  const systemPrompt = `${SYSTEM_BASE}\n\nYou are: ${char.nameEN} (${char.nameTH})\n${char.personality}\n\nLanguage: ${langNote}`;

  // SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let aborted = false;
  const controller = new AbortController();
  req.on('close', () => { aborted = true; controller.abort(); });

  try {
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
        options: { temperature: 0.9, top_p: 0.95, num_predict: 300 },
      }),
    });

    if (!ollamaRes.ok) {
      const t = await ollamaRes.text();
      throw new Error(`Ollama ${ollamaRes.status}: ${t}`);
    }

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done || aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk;
        try { chunk = JSON.parse(line); } catch { continue; }

        if (chunk.message?.content) send({ type: 'delta', text: chunk.message.content });
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.done) { send({ type: 'done' }); res.end(); return; }
      }
    }

    if (!res.writableEnded) res.end();

  } catch (err) {
    if (aborted) return;
    console.error('[chat]', err.message);
    const msg =
      err.message.includes('ECONNREFUSED') ? 'ยังเชื่อมต่อ Ollama ไม่ได้ โปรดรอสักครู่...' :
      err.message.includes('model') ? `ไม่พบ model "${OLLAMA_MODEL}"` :
      'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
    if (!res.headersSent) return res.status(502).json({ error: msg });
    send({ type: 'error', message: msg });
    res.end();
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`💕  Romance Chatbot → http://localhost:${PORT}`);
  console.log(`🤖  Ollama          → ${OLLAMA_HOST}`);
  console.log(`🧠  Model           → ${OLLAMA_MODEL}`);
});