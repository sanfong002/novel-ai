// Vercel Edge Function — Cerebras streaming (OpenAI-compatible)
// เร็วที่สุดในโลก ~1000 tokens/วินาที ฟรี 30 req/นาที

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL   = 'llama-3.3-70b';
const CEREBRAS_URL     = 'https://api.cerebras.ai/v1/chat/completions';

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

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  if (!CEREBRAS_API_KEY)
    return new Response(JSON.stringify({ error: 'CEREBRAS_API_KEY not set — add it in Vercel Environment Variables' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

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

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();
  const send   = (data) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

  (async () => {
    try {
      const res = await fetch(CEREBRAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: CEREBRAS_MODEL,
          stream: true,
          max_tokens: 300,
          temperature: 0.9,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const friendly =
          res.status === 401 ? 'CEREBRAS_API_KEY ไม่ถูกต้อง — เช็คใน Vercel Environment Variables' :
          res.status === 429 ? 'Rate limit — รอสักครู่แล้วลองใหม่' :
          `Cerebras error ${res.status}: ${errText}`;
        await send({ type: 'error', message: friendly });
        return;
      }

      const reader  = res.body.getReader();
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
          if (payload === '[DONE]') { await send({ type: 'done' }); return; }
          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) await send({ type: 'delta', text: delta });
        }
      }

      await send({ type: 'done' });

    } catch (err) {
      await send({ type: 'error', message: err.message });
    } finally {
      await writer.close().catch(() => {});
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