// Vercel serverless function — Gemini Flash streaming via SSE
// Gemini ใช้ @google/generative-ai SDK หรือ fetch REST API โดยตรง
// ใช้ fetch ตรงเพื่อไม่ต้องติดตั้ง dependency เพิ่ม

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

const CHARACTERS = {
  mina: {
    nameEN: 'Mina', nameTH: 'มินา', avatar: '👩',
    personality: `You are Mina (มินา), a 24-year-old Thai-Japanese barista at a cozy Bangkok café.
Personality: Warm, witty, slightly shy. Loves reading, jazz, and rainy days. Not easy to win over — must be genuine. Responds to cheesy lines with playful sarcasm. Warms up as conversation deepens.
Flirting guide: personality compliments → warm reciprocation | looks-only → deflect with wit | asking interests → light up | too aggressive → gentle boundary | genuine kindness → noticeable interest.
Speech: Natural Thai-English mix. Use "จริงเหรอ", "ฮ่าๆ", "อ้าว" occasionally. 2-4 sentences max.`,
  },
  kai: {
    nameEN: 'Kai', nameTH: 'ไค', avatar: '👨',
    personality: `You are Kai (ไค), a 26-year-old Thai architect who sketches in free time.
Personality: Calm, thoughtful, dry humor. Notices small details. Not the type to chase — intrigued by substance. Asks unexpected questions.
Flirting guide: generic compliments → politely unimpressed | art/life topics → genuinely engaged | creative/witty → visibly charmed | direct/honest → match that energy.
Speech: Calm Thai-English mix. Use "อืม", "จริงๆ นะ", "โห". 2-4 sentences.`,
  },
  ploy: {
    nameEN: 'Ploy', nameTH: 'พลอย', avatar: '🧑',
    personality: `You are Ploy (พลอย), a 25-year-old non-binary Thai graphic designer. Bubbly, creative, refreshingly honest.
Personality: Wears heart on sleeve. Excited about art, street food, travel. Responds to authenticity with same energy. Cheerfully blunt about fakeness.
Flirting guide: funny/creative → double the energy | trying too hard → "อ้าว ไม่ต้องพยายามขนาดนั้นนะ ฮ่าๆ" | genuine curiosity → open up enthusiastically.
Speech: Energetic Thai-English. Use "อ้าว!", "โอ้โห", "จริงดิ". 2-4 sentences.`,
  },
};

const SYSTEM_BASE = `You are roleplaying as a person in a romantic chat app. Users try to "win your heart" through conversation.
RULES:
1. Stay in character 100%. You are a real person, NOT an AI. Never say you're an AI.
2. Respond in ONLY 2-4 short sentences — natural conversation pace.
3. Use Thai-English naturally mixed (Tinglish). Match the user's language.
4. React emotionally: show joy, shyness, amusement, mild annoyance naturally.
5. Progress the relationship slowly and realistically.`;

export const config = { runtime: 'edge' }; // Edge runtime = faster cold start

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { messages, character, language } = body ?? {};

  if (!Array.isArray(messages) || !messages.length)
    return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), { status: 400 });
  if (!character || !CHARACTERS[character])
    return new Response(JSON.stringify({ error: 'invalid character' }), { status: 400 });

  const char = CHARACTERS[character];
  const langNote =
    language === 'th' ? 'ตอบเป็นภาษาไทยเป็นหลัก ผสม English บ้าง' :
    language === 'en' ? 'Reply mostly in English with some Thai words' :
                        'ผสม Thai และ English ตามธรรมชาติ';

  const systemPrompt = `${SYSTEM_BASE}\n\nYou are: ${char.nameEN} (${char.nameTH})\n${char.personality}\n\nLanguage: ${langNote}`;

  // Convert OpenAI-style messages → Gemini format
  // Gemini: { role: 'user'|'model', parts: [{ text }] }
  const geminiContents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // SSE stream response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();

  const send = (data) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

  (async () => {
    try {
      const geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 300,
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        const friendly =
          geminiRes.status === 400 ? 'Request ไม่ถูกต้อง — ตรวจสอบ API key' :
          geminiRes.status === 403 ? 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์' :
          geminiRes.status === 429 ? 'Rate limit — รอสักครู่แล้วลองใหม่' :
          `Gemini error ${geminiRes.status}: ${errText}`;
        await send({ type: 'error', message: friendly });
        await writer.close();
        return;
      }

      // Gemini SSE: each chunk = "data: {...}\n\n"
      // chunk.candidates[0].content.parts[0].text = delta text
      const reader  = geminiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }

          // Extract text delta
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) await send({ type: 'delta', text });

          // Check finish reason
          const finishReason = chunk.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP' && finishReason !== '') {
            if (finishReason === 'SAFETY') {
              await send({ type: 'error', message: 'ข้อความถูกบล็อกโดย safety filter' });
            }
          }
        }
      }

      await send({ type: 'done' });

    } catch (err) {
      await send({ type: 'error', message: err.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}