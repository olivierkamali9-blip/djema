// ============================================
// API SERVERLESS (Vercel) — Transcription vocale multi-modèles
// Reçoit un fichier audio en base64, le transcrit en parallèle via :
//   1. Sahara (Intron)   — le modèle obligatoire du challenge
//   2. Whisper (OpenAI)  — modèle de comparaison n°1
//   3. Gemini (Google)   — modèle de comparaison n°2
// Retourne les 3 transcriptions + le temps de réponse de chacune,
// pour servir de données de benchmark exigées par Sahara CodeSwitch Challenge.
//
// Les clés API restent ici, côté serveur — jamais exposées au navigateur.
// À configurer dans Vercel : Project Settings → Environment Variables
//   SAHARA_API_KEY
//   OPENAI_API_KEY
//   GOOGLE_API_KEY
// ============================================

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

// ---------- Sahara (Intron) ----------
async function transcrireSahara(audioBase64, mimeType) {
  const cle = process.env.SAHARA_API_KEY;
  if (!cle) {
    return { modele: "sahara", texte: null, erreur: "SAHARA_API_KEY manquante", duree_ms: 0 };
  }
  const debut = Date.now();
  try {
    // NOTE : endpoint à ajuster une fois la documentation Sahara reçue par email.
    // Structure standard prévue pour une API de transcription REST.
    const reponse = await fetch("https://api.intron.io/sahara/v1/transcribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio: audioBase64,
        mime_type: mimeType,
        language_hints: ["fr", "ln", "sw"], // français, lingala, swahili
      }),
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.message || "Erreur API Sahara");
    return {
      modele: "sahara",
      texte: data.transcript || data.text || "",
      erreur: null,
      duree_ms: Date.now() - debut,
    };
  } catch (e) {
    return { modele: "sahara", texte: null, erreur: e.message, duree_ms: Date.now() - debut };
  }
}

// ---------- Whisper (OpenAI) ----------
async function transcrireWhisper(audioBase64, mimeType) {
  const cle = process.env.OPENAI_API_KEY;
  if (!cle) {
    return { modele: "whisper", texte: null, erreur: "OPENAI_API_KEY manquante", duree_ms: 0 };
  }
  const debut = Date.now();
  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: mimeType }), `audio.${extension}`);
    formData.append("model", "whisper-1");

    const reponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}` },
      body: formData,
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur API Whisper");
    return { modele: "whisper", texte: data.text || "", erreur: null, duree_ms: Date.now() - debut };
  } catch (e) {
    return { modele: "whisper", texte: null, erreur: e.message, duree_ms: Date.now() - debut };
  }
}

// ---------- Gemini (Google) ----------
async function transcrireGemini(audioBase64, mimeType) {
  const cle = process.env.GOOGLE_API_KEY;
  if (!cle) {
    return { modele: "gemini", texte: null, erreur: "GOOGLE_API_KEY manquante", duree_ms: 0 };
  }
  const debut = Date.now();
  try {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: "Transcris cet audio exactement mot pour mot, sans rien ajouter ni traduire. L'audio peut mélanger français, lingala et swahili." },
                { inline_data: { mime_type: mimeType, data: audioBase64 } },
              ],
            },
          ],
        }),
      }
    );
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur API Gemini");
    const texte = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { modele: "gemini", texte, erreur: null, duree_ms: Date.now() - debut };
  } catch (e) {
    return { modele: "gemini", texte: null, erreur: e.message, duree_ms: Date.now() - debut };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64) {
    return res.status(400).json({ error: "Aucun audio fourni" });
  }

  const [sahara, whisper, gemini] = await Promise.all([
    transcrireSahara(audioBase64, mimeType || "audio/webm"),
    transcrireWhisper(audioBase64, mimeType || "audio/webm"),
    transcrireGemini(audioBase64, mimeType || "audio/webm"),
  ]);

  return res.status(200).json({
    resultats: [sahara, whisper, gemini],
    // Le texte principal utilisé pour l'extraction = Sahara en priorité,
    // sinon on retombe sur le premier modèle qui a réussi.
    texte_principal:
      sahara.texte || whisper.texte || gemini.texte || "",
  });
}
