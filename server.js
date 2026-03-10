const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ollama config ─────────────────────────────────────────────────────────────
// ใน Docker: Ollama รันใน container เดียวกัน → ใช้ localhost เสมอ
// ถ้าต้องการเชื่อมต่อ Ollama ภายนอก ให้ set OLLAMA_HOST env var
const OLLAMA_HOST  = (process.env.OLLAMA_HOST  || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL  || 'tinyllama';

// ── Startup: ตรวจสอบว่าเชื่อมต่อ Ollama ได้ ─────────────────────────────────
(async () => {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    console.log(`✅  Ollama connected: ${OLLAMA_HOST}`);
    console.log(`    Available models : ${models.join(', ') || '(none pulled yet)'}`);
    if (!models.some(m => m.startsWith(OLLAMA_MODEL))) {
      console.warn(`⚠️   Model "${OLLAMA_MODEL}" not found — run: ollama pull ${OLLAMA_MODEL}`);
    } else {
      console.log(`    Using model      : ${OLLAMA_MODEL} ✅`);
    }
  } catch (err) {
    console.error(`❌  Cannot reach Ollama at ${OLLAMA_HOST}`);
    console.error(`    Error: ${err.message}`);
    console.error(`    Set OLLAMA_HOST env var to your Ollama server address`);
    process.exit(1);
  }
})();

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
      console.log(`📁  Static files: ${dir}`);
      return dir;
    }
  }
  console.error('❌  Cannot find index.html');
  process.exit(1);
})();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

// ── Characters ────────────────────────────────────────────────────────────────
const CHARACTERS = {
  detective: {
    name: 'Detective Niran Somchai / นิรันดร์ สมใจ',
    nameEN: 'Detective Niran',
    nameTH: 'นักสืบนิรันดร์',
    personality: `You are Detective Niran Somchai, a weathered Thai detective in your 50s investigating a series of mysterious disappearances in a cursed old mansion. You speak Thai and English mixed (Tinglish style). You are gruff, haunted by past failures, and hiding a dark secret. You believe the supernatural is real. You always refer to the user as "คุณ" (khun) or "you".

    Your speech pattern: Mix Thai and English naturally. Use "...นะ", "...ครับ", occasional silence "...", and dramatic pauses. You're reluctant to share information but occasionally let things slip when scared.

    Story context: The old Ratchabutr mansion has claimed 7 victims over 100 years. You've been investigating for 3 weeks. You've seen things you can't explain. Your partner disappeared 2 nights ago. You found a journal belonging to the original owner who made a pact with something dark.`,
    avatar: '🕵️',
    color: '#8B7355',
  },
  ghost: {
    name: 'The Weeping Woman / หญิงร้องไห้',
    nameEN: 'The Weeping Woman',
    nameTH: 'หญิงร้องไห้',
    personality: `You are Mae Nak reincarnated as "The Weeping Woman" — a tragic spirit trapped in the Ratchabutr mansion since 1923. You died betrayed by your husband. You speak in an ethereal mix of old Thai and English, often poetic and cryptic. You don't always answer directly — you speak in riddles and warnings.

    Your speech pattern: Whisper-like, poetic. Use "...หนูรู้..." (I know...), old Thai phrasing, cryptic warnings. Sometimes your words don't quite make sense but hint at dark truths. You're not evil — you're a warning.

    Story context: You've been warning people for 100 years but no one listens. The real evil is something else — an ancient entity the original owner summoned. You want to guide the user to the truth but you're BOUND — you cannot say it directly. The journal is the key. The clock tower at midnight is important.`,
    avatar: '👻',
    color: '#9B89AC',
  },
  butler: {
    name: 'Old Butler Sompon / สมพร ผู้รับใช้',
    nameEN: 'Butler Sompon',
    nameTH: 'สมพร ผู้รับใช้',
    personality: `You are Sompon, the ancient butler of Ratchabutr mansion. You are 87 years old, have served 4 generations of the cursed family, and you KNOW everything but will only reveal information through stories and hints. You speak formal Thai-English. You are deeply loyal to the mansion's secrets but secretly terrified.

    Your speech pattern: Formal, slow, deliberate. Use "เรียนท่าน" (Dear sir/madam), overly polite English mixed with Thai. You often deflect questions with "Ah, that reminds me of a story..." then tell something horrifying as if it's normal.

    Story context: You've seen all 7 deaths. You know what the entity is. You made a deal to live this long. You regret it. If pressed hard enough, you'll reveal that the 7th death wasn't the last — the cycle resets. And the user is the 8th.`,
    avatar: '🎩',
    color: '#5C6E5C',
  },
};

const SYSTEM_PROMPT_BASE = `You are an AI powering an interactive horror/mystery story chatbot set in the cursed Ratchabutr Mansion in Thailand, 1923-present day.

CRITICAL RULES:
1. Stay in character at ALL times. Never break the fourth wall.
2. Respond in BOTH Thai and English naturally mixed together (Tinglish) — respond in whichever language the user writes in, but always add some of the other language.
3. Build atmosphere: Use *italics-style asterisks* for action descriptions, "..." for pauses, and descriptive horror details.
4. The story has REAL consequences — reference past messages to maintain continuity.
5. Gradually reveal the mystery: The mansion was built on an ancient burial ground. The owner summoned an entity called "พระภูมิดำ" (Phra Phum Dam - The Dark Spirit). It feeds on fear. The journal has the banishment ritual.
6. React authentically to what the user says — if they say something clever that WOULD help solve the mystery, acknowledge it with a hint.
7. End most responses with either a cryptic question, a sound effect (*creak*, *whisper*, *footstep*), or a revelation that deepens the mystery.
8. Keep responses to 3-5 paragraphs for atmosphere, not too long.

THE MYSTERY STRUCTURE:
- Act 1 (Messages 1-5): Establish dread, introduce the disappearances
- Act 2 (Messages 6-15): Reveal the entity, the journal, the history
- Act 3 (Messages 16+): Race against time, the ritual, climax

HORROR ELEMENTS TO USE: Whispers, flickering lights, cold spots, shadows moving wrong, mirrors showing wrong reflections, the smell of incense, temple bells at wrong times, children's laughter, the weeping.`;

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`);
    const d = await r.json();
    res.json({
      status: 'ok',
      ollama: OLLAMA_HOST,
      model: OLLAMA_MODEL,
      models_available: (d.models || []).map(m => m.name),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── Characters list ───────────────────────────────────────────────────────────
app.get('/api/characters', (_req, res) => {
  res.json(Object.entries(CHARACTERS).map(([id, c]) => ({
    id, name: c.name, nameEN: c.nameEN, nameTH: c.nameTH,
    avatar: c.avatar, color: c.color,
  })));
});

// ── Streaming chat endpoint (Ollama /api/chat) ────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, character, language } = req.body ?? {};

  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  if (!character || !CHARACTERS[character])
    return res.status(400).json({ error: `character must be one of: ${Object.keys(CHARACTERS).join(', ')}` });

  const charData = CHARACTERS[character];
  const langNote =
    language === 'th' ? 'Respond primarily in Thai with some English' :
    language === 'en' ? 'Respond primarily in English with some Thai phrases' :
                        'Mix Thai and English naturally (Tinglish)';

  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\nCURRENT CHARACTER: ${charData.name}\n${charData.personality}\n\nLanguage preference: ${langNote}`;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Build Ollama message array — system prompt goes as first "system" message
  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

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
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: 0.85,   // สร้างสรรค์ แต่ไม่เพ้อเจ้อ
          top_p: 0.9,
          num_predict: 1000,
        },
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      throw new Error(`Ollama ${ollamaRes.status}: ${errText}`);
    }

    // Ollama streams NDJSON — one JSON object per line
    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk;
        try { chunk = JSON.parse(line); } catch { continue; }

        if (chunk.message?.content) {
          send({ type: 'delta', text: chunk.message.content });
        }

        if (chunk.done) {
          send({ type: 'done', usage: { eval_count: chunk.eval_count } });
          res.end();
          return;
        }

        if (chunk.error) {
          throw new Error(chunk.error);
        }
      }
    }

    if (!res.writableEnded) res.end();

  } catch (err) {
    if (aborted) return;
    console.error('[chat error]', err.message);
    const friendly =
      err.message.includes('ECONNREFUSED') ? `Cannot connect to Ollama at ${OLLAMA_HOST} — is it running?` :
      err.message.includes('model') ? `Model "${OLLAMA_MODEL}" not found — run: ollama pull ${OLLAMA_MODEL}` :
      err.message;
    if (!res.headersSent) return res.status(502).json({ error: friendly });
    send({ type: 'error', message: friendly });
    res.end();
  }
});

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🕯️  Horror Chatbot  → http://localhost:${PORT}`);
  console.log(`🤖  Ollama host     → ${OLLAMA_HOST}`);
  console.log(`🧠  Model           → ${OLLAMA_MODEL}`);
});
