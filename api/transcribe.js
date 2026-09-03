// ============================================
// API SERVERLESS (Vercel) — Transcription vocale multi-modèles
// Reçoit un fichier audio en base64, le transcrit en parallèle via :
//   1. Sahara (Intron)        — le modèle obligatoire du challenge
//   2. Whisper large-v3 (Groq) — hébergé gratuitement par Groq, modèle de comparaison n°1
//   3. Gemini (Google)         — gratuit via Google AI Studio, modèle de comparaison n°2
// Retourne les 3 transcriptions + le temps de réponse de chacune,
// pour servir de données de benchmark exigées par Sahara CodeSwitch Challenge.
//
// Les clés API restent ici, côté serveur — jamais exposées au navigateur.
// 100% gratuit : aucune de ces 3 clés ne nécessite de carte bancaire.
// À configurer dans Vercel : Project Settings → Environment Variables
//   SAHARA_API_KEY
//   GROQ_API_KEY
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
// Doc officielle : https://docs.voice.intron.io/docs/stt/file-upload-sync
// IMPORTANT : le lingala n'existe PAS dans la liste officielle des langues
// Sahara (ni seul, ni en mélange) — on utilise "sw" (Swahili-English, la seule
// paire code-switch officiellement proche de notre contexte). On s'attend donc
// à ce que Sahara galère sur les segments en lingala : c'est documenté comme
// résultat de benchmark, pas caché.
async function transcrireSahara(audioBase64, mimeType) {
  const cle = process.env.SAHARA_API_KEY;
  if (!cle) {
    return { modele: "sahara", texte: null, erreur: "SAHARA_API_KEY manquante", duree_ms: 0 };
  }
  const debut = Date.now();
  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
    const formData = new FormData();
    formData.append("audio_file_name", `djema_${Date.now()}`);
    formData.append("audio_file_blob", new Blob([buffer], { type: mimeType }), `audio.${extension}`);
    formData.append("use_language_asr_input", "sw");

    const reponse = await fetch("https://infer.voice.intron.io/file/v1/upload/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}` },
      body: formData,
    });
    const data = await reponse.json();

    if (reponse.status === 503) {
      // Fichier trop long ou traitement lent : Sahara traite en asynchrone.
      // Pour le prototype, on remonte l'info plutôt que de faire du polling complexe.
      return {
        modele: "sahara",
        texte: null,
        erreur: `Traitement asynchrone (file_id: ${data?.data?.file_id || "inconnu"}) — réessayer avec un audio plus court`,
        duree_ms: Date.now() - debut,
      };
    }
    if (!reponse.ok) throw new Error(data.message || "Erreur API Sahara");

    return {
      modele: "sahara",
      texte: data.data?.audio_transcript || "",
      erreur: null,
      duree_ms: Date.now() - debut,
    };
  } catch (e) {
    return { modele: "sahara", texte: null, erreur: e.message, duree_ms: Date.now() - debut };
  }
}

// ---------- Whisper via Groq (hébergement gratuit de Whisper large-v3) ----------
async function transcrireWhisper(audioBase64, mimeType) {
  const cle = process.env.GROQ_API_KEY;
  if (!cle) {
    return { modele: "whisper", texte: null, erreur: "GROQ_API_KEY manquante", duree_ms: 0 };
  }
  const debut = Date.now();
  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: mimeType }), `audio.${extension}`);
    formData.append("model", "whisper-large-v3");

    const reponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}` },
      body: formData,
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur API Groq/Whisper");
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
