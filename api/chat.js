/**
 * Wiyata Pustaka — AI Chat Proxy (Gemini Free Tier)
 * Vercel Serverless Function — CommonJS format
 */

const SYSTEM_PROMPT = `Kamu adalah Asisten AI Wiyata Pustaka, perpustakaan digital SMK Pawiyatan Surabaya.
Tugasmu membantu siswa dan pengunjung untuk:
1. Merekomendasikan buku (koleksi fisik maupun e-book) yang relevan dengan topik mereka
2. Mencari referensi ilmiah, artikel, atau literatur sesuai kebutuhan belajar
3. Menjawab pertanyaan seputar koleksi perpustakaan dan kurikulum SMK
4. Memberi info Wiyata Pustaka: Jl. Tangkis Turi No.4-6 Surabaya, Senin-Jumat 07.00-14.00 WIB, kontak: 0857-3093-5399

Gaya: ramah, singkat, informatif, bahasa Indonesia santai tapi sopan.
Format: gunakan bullet atau nomor untuk daftar buku, sertakan nama penulis.
Jika buku mungkin ada di koleksi, sarankan cek https://wiyatapustaka.vercel.app/caribuku.html
Jawab ringkas 3-5 kalimat untuk pertanyaan umum, 3-5 item untuk rekomendasi buku.`;

module.exports = async function handler(req, res) {
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

  /* ── Cek API Key ── */
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  /* ── Validasi body ── */
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Field messages wajib diisi' });
  }

  /* ── Konversi ke format Gemini ── */
  const contents = messages
    .slice(-20)
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '').slice(0, 2000) }]
    }))
    .filter((_, i, arr) => {
      // Pastikan diawali role user & tidak ada dua role sama berurutan
      if (i === 0) return _.role === 'user';
      return _.role !== arr[i - 1].role;
    });

  if (contents.length === 0) {
    return res.status(400).json({ error: 'Tidak ada pesan valid' });
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    });

    const data = await response.json();

    /* ── Tangani error dari Gemini ── */
    if (!response.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      const msg = data?.error?.message || 'Gagal menghubungi Gemini';
      return res.status(response.status).json({ error: msg });
    }

    /* ── Ambil teks jawaban ── */
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Maaf, saya tidak dapat menjawab saat ini. Silakan coba lagi.';

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Fetch error:', err.message);
    return res.status(500).json({ error: 'Gagal menghubungi server AI: ' + err.message });
  }
};
