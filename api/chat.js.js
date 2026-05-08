/**
 * Wiyata Pustaka — AI Chat Proxy
 * Vercel Serverless Function
 *
 * API key disimpan di environment variable Vercel (aman, tidak terekspos ke browser).
 * Frontend memanggil /api/chat, bukan Anthropic langsung.
 */

export default async function handler(req, res) {
  // ── CORS: hanya izinkan dari domain Wiyata Pustaka ──
  const allowed = [
    'https://wiyatapustaka.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validasi API key tersedia
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY belum diset di environment variables Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Ambil messages dari body
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Field "messages" wajib diisi' });
  }

  // Batasi: maks 20 pesan & panjang konten 2000 karakter per pesan (anti-abuse)
  const trimmed = messages.slice(-20).map(m => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content.slice(0, 2000)
      : m.content
  }));

  // ── System prompt perpustakaan ──
  const SYSTEM = `Kamu adalah Asisten AI Wiyata Pustaka, perpustakaan digital SMK Pawiyatan Surabaya.
Tugasmu membantu siswa dan pengunjung untuk:
1. Merekomendasikan buku (koleksi fisik maupun e-book) yang relevan dengan topik mereka
2. Mencari referensi ilmiah, artikel, atau literatur sesuai kebutuhan belajar
3. Menjawab pertanyaan seputar koleksi perpustakaan dan kurikulum SMK
4. Memberi info Wiyata Pustaka: Jl. Tangkis Turi No.4-6 Surabaya, Senin-Jumat 07.00-14.00 WIB, kontak: 0857-3093-5399

Gaya: ramah, singkat, informatif, bahasa Indonesia santai tapi sopan.
Format: gunakan bullet/nomor untuk daftar buku, sertakan nama penulis.
Jika buku mungkin ada di koleksi, sarankan cek https://wiyatapustaka.vercel.app/caribuku.html
Jawab ringkas 3-5 kalimat untuk pertanyaan umum, 3-5 item untuk rekomendasi.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM,
        messages: trimmed,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error('Anthropic error:', data);
      return res.status(upstream.status).json({ error: data?.error?.message || 'Upstream error' });
    }

    // Kirim hanya konten teks ke frontend
    let reply = '';
    if (data.content) {
      data.content.forEach(block => {
        if (block.type === 'text') reply += block.text;
      });
    }

    return res.status(200).json({ reply: reply || 'Maaf, tidak ada respons dari AI.' });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Gagal menghubungi server AI' });
  }
}
