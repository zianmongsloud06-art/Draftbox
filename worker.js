const MODEL = 'gemini-2.5-flash';
const MAX_INPUT = 1000;
const LIMIT = 10;
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {status, headers: {'Content-Type': 'application/json'}});

async function generate(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (limited(ip)) return json({error: 'Too many requests.'}, 429);

  let body;
  try { body = await request.json(); } catch { return json({error: 'Bad request.'}, 400); }

  const prompt = String(body.prompt || '').trim().slice(0, MAX_INPUT);
  if (!prompt) return json({error: 'Prompt is empty.'}, 400);

  const tone = ['Friendly','Professional','Funny','Poetic','Direct'].includes(body.tone) ? body.tone : 'Friendly';
  const words = {Short: '50-100', Medium: '150-250', Long: '400-600'}[body.length] || '150-250';

  const system = `You are a writing assistant. Write in a ${tone.toLowerCase()} tone, about ${words} words. ` +
    `Return only the finished text, with no preamble or commentary.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: system}]},
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 1000}
      })
    }
  );

  if (!res.ok) return json({error: 'The AI service is busy or over its free limit.'}, 502);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) return json({error: 'No text came back.'}, 502);
  return json({text});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/generate') {
      if (request.method !== 'POST') return json({error: 'Use POST.'}, 405);
      return generate(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
