// ============================================
// API SERVERLESS (Vercel) — Complément vocal rapide
// Utilisé quand un champ précis manque (ex: prix) : l'utilisateur
// enregistre une courte réponse, on la transcrit vite (un seul modèle,
// Whisper via Groq — le plus rapide des 3, ~0.5-1s) plutôt que de refaire
// tout le pipeline de benchmark à 3 modèles.
//
// À configurer dans Vercel : Project Settings → Environment Variables
//   GROQ_API_KEY
// ============================================

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64) {
    return res.status(400).json({ error: "Aucun audio fourni" });
  }

  const cle = process.env.GROQ_API_KEY;
  if (!cle) {
    return res.status(500).json({ error: "GROQ_API_KEY manquante côté serveur" });
  }

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const type = mimeType || "audio/webm";
    const extension = type.includes("webm") ? "webm" : type.includes("mp4") ? "mp4" : "wav";
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type }), `audio.${extension}`);
    formData.append("model", "whisper-large-v3");

    const reponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}` },
      body: formData,
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur de transcription rapide");

    return res.status(200).json({ texte: data.text || "" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
