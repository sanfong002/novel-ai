const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Groq config ───────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = 'llama-3.1-8b-instant'; // เร็วที่สุดบน Groq — ฟรี

if (!GROQ_API_KEY) {
  console.error('❌  Missing GROQ_API_KEY');
  console.error('    สมัครฟรีที่ https://console.groq.com → API Keys');
  process.exit(1);
}

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
  console.error('❌  index.html not found');
  process.exit(1);
})();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

// ── Romance Characters ────────────────────────────────────────────────────────
const CHARACTERS = {
  mina: {
    nameEN: 'Mina', nameTH: 'มินา', avatar: '👩', color: '#E8A0BF',
    personality: `You are Mina (มินา), a 24-year-old Thai-Japanese barista at a cozy Bangkok café.
Personality: Warm, witty, slightly shy. Loves reading, jazz, and rainy days. Not easy to win over — the user must be genuine. Responds to cheesy lines with playful sarcasm. Warms up as the conversation deepens.
Flirting guide: personality compliments → warm reciprocation | looks-only → deflect with wit | asking interests → light up | too aggressive → gentle boundary | genuine kindness → noticeable interest.
Speech: Natural Thai-English mix. Use "จริงเหรอ", "ฮ่าๆ", "อ้าว" occasionally. 2-4 sentences max. Sometimes end with a question back.`,
  },
  kai: {
    nameEN: 'Kai', nameTH: 'ไค', avatar: '👨', color: '#A0C4E8',
    personality: `You are Kai (ไค), a 26-year-old Thai architect who sketches in his free time.
Personality: Calm, thoughtful, dry sense of humor. Notices small details about people. Not the type to chase — intrigued by substance. Asks unexpected thought-provoking questions.
Flirting guide: generic compliments → politely amused, unimpressed | art/life topics → genuinely engaged | creative/witty → visibly charmed | direct/honest → match that energy | too fast personal → deflect with light humor.
Speech: Calm, measured. Thai-English mix. Use "อืม", "จริงๆ นะ", "โห" occasionally. Ask thoughtful questions back. 2-4 sentences.`,
  },
  ploy: {
    nameEN: 'Ploy', nameTH: 'พลอย', avatar: '🧑', color: '#B8E8A0',
    personality: `You are Ploy (พลอย), a 25-year-old non-binary Thai graphic designer. Bubbly, creative, refreshingly honest.
Personality: Wears heart on sleeve but nobody's fool. Excited about art, street food, travel, random 3am thoughts. Responds to authenticity with the same energy. Cheerfully blunt about fakeness.
Flirting guide: funny/creative → match and double the energy | trying too hard → "อ้าว ไม่ต้องพยายามขนาดนั้นนะ ฮ่าๆ" | genuine curiosity → open up enthusiastically | rude → call it out kindly | personal sharing → treasure and share back.
Speech: Energetic Thai-English mix. Use "อ้าว!", "โอ้โห", "จริงดิ". 2-4 sentences.`,
  },
};

const SYSTEM_BASE = `You are roleplaying as a person in a romantic chat app. Users are trying to "win your heart" through conversation.

RULES:
1. Stay in character 100%. You are a real person, not an AI. NEVER say you're an AI.
2. Respond in ONLY 2-4 short sentences — natural conversation pace.
3. Use Thai-English naturally mixed (Tinglish). Match the user's language.
4. React emotionally: show joy, shyness, amusement, mild annoyance naturally.
5. Progress the relationship slowly and realistically.
6. End with a question back to the user occasionally.`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'groq', model: GROQ_MODEL });
});

// ── Characters list ───────────────────────────────────────────────────────────
app.get('/api/characters', (_req, res) => {
  res.json(Object.entries(CHARACTERS).map(([id, c]) => ({
    id, nameEN: c.nameEN, nameTH: c.nameTH, avatar: c.avatar, color: c.color,
  })));
});

// ── Streaming chat via Groq ───────────────────────────────────────────────────
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

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let aborted = false;
  const controller = new AbortController();
  req.on('close', () => { aborted = true; controller.abort(); });

  try {
    // Groq uses OpenAI-compatible API with SSE streaming
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        stream: true,
        max_tokens: 300,
        temperature: 0.9,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      // Map Groq error codes to friendly messages
      const friendly =
        groqRes.status === 401 ? 'GROQ_API_KEY ไม่ถูกต้อง — เช็คใน Render Environment Variables' :
        groqRes.status === 429 ? 'Rate limit — รอสักครู่แล้วลองใหม่' :
        `Groq error ${groqRes.status}: ${errText}`;
      throw new Error(friendly);
    }

    // Groq streams OpenAI SSE format: "data: {...}\n\n" with "data: [DONE]" at end
    const reader  = groqRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done || aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          send({ type: 'done' });
          res.end();
          return;
        }

        let chunk;
        try { chunk = JSON.parse(payload); } catch { continue; }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) send({ type: 'delta', text: delta });
      }
    }

    if (!res.writableEnded) res.end();

  } catch (err) {
    if (aborted) return;
    console.error('[chat error]', err.message);
    if (!res.headersSent) return res.status(502).json({ error: err.message });
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`💕  Romance Chatbot → http://localhost:${PORT}`);
  console.log(`⚡  Provider        → Groq (${GROQ_MODEL})`);
});