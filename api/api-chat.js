/**
 * Wiyata Pustaka — AI Chat Proxy (Gemini Free Tier)
 * Vercel Serverless Function
 *
 * Menggunakan Google Gemini API — GRATIS hingga:
 *   • 1.500 request/hari
 *   • 1.000.000 token/menit
 * API key disimpan di environment variable Vercel (aman, tidak terekspos browser).
 */

export default async function handler(req, res) {
  /* ── CORS ── */
  const allowed = [
    'https://wiyatapustaka.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY belum diset di environment variables Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Field "messages" wajib diisi' });
  }

  /* ── System prompt perpustakaan ── */
  const SYSTEM_PROMPT = `Kamu adalah Asisten AI Wiyata Pustaka, perpustakaan digital SMK Pawiyatan Surabaya.
Tugasmu membantu siswa dan pengunjung untuk:
1. Merekomendasikan buku (koleksi fisik maupun e-book) yang relevan dengan topik mereka
2. Mencari referensi ilmiah, artikel, atau literatur sesuai kebutuhan belajar
3. Menjawab pertanyaan seputar koleksi perpustakaan dan kurikulum SMK
4. Memberi info Wiyata Pustaka: Jl. Tangkis Turi No.4-6 Surabaya, Senin-Jumat 07.00-14.00 WIB, kontak: 0857-3093-5399

Gaya: ramah, singkat, informatif, bahasa Indonesia santai tapi sopan.
Format: gunakan bullet/nomor untuk daftar buku, sertakan nama penulis.
Jika buku mungkin ada di koleksi, sarankan cek https://wiyatapustaka.vercel.app/caribuku.html
Jawab ringkas 3-5 kalimat untuk pertanyaan umum, 3-5 item untuk rekomendasi buku.`;

  /* ── Konversi history ke format Gemini (role: user/model) ── */
  const trimmed = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content.slice(0, 2000) : '' }]
  }));

  /* Gemini wajib diawali role "user" */
  while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

  const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

  try {
    const upstream = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: trimmed,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(upstream.status).json({ error: data?.error?.message || 'Upstream error' });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Maaf, saya tidak dapat menjawab saat ini. Silakan coba lagi.';

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Gagal menghubungi server AI' });
  }
}
