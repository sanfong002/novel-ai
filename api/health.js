export default function handler(req, res) {
  res.json({
    status: 'ok',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    key_set: !!process.env.GEMINI_API_KEY,
  });
}