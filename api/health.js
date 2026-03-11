export default function handler(req, res) {
  res.json({
    status: 'ok',
    provider: 'openrouter',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    key_set: !!process.env.OPENROUTER_API_KEY,
  });
}
