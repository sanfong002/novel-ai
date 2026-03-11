export default function handler(req, res) {
  res.json({
    status: 'ok',
    provider: 'cerebras',
    model: 'llama-3.3-70b',
    key_set: !!process.env.CEREBRAS_API_KEY,
  });
}