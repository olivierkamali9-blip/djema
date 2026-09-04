// ============================================
// API SERVERLESS (Vercel) — Extraction d'intention de recherche vocale
// Reçoit une phrase transcrite (recherche parlée en FR/lingala/swahili
// mélangés) et en extrait : mots-clés, catégorie, quartier, prix max.
//
// Utilise Gemini (Google) — gratuit.
// À configurer dans Vercel : Project Settings → Environment Variables
//   GOOGLE_API_KEY
// ============================================

const CATEGORIES_CONNUES = ["Vente", "Recherche", "Emploi", "Service"];

const PROMPT_SYSTEME = `Tu es l'agent de recherche vocale de Djema, une marketplace de petites annonces à Bunia (RDC). L'utilisateur vient de DIRE (pas écrire) ce qu'il cherche, en mélangeant possiblement français, lingala et swahili.

Comprends l'INTENTION derrière ses mots et transforme-la en filtre de recherche.

Réponds UNIQUEMENT en JSON valide, exactement cette structure :
{
  "mots_cles": "string, les mots-clés essentiels du produit/service cherché, en français si possible (ex: 'frigo', 'mécanicien')",
  "categorie": "une seule valeur parmi: Vente, Recherche, Emploi, Service, ou vide si pas clairement déductible",
  "quartier": "string, le quartier mentionné, vide si non mentionné",
  "prix_max": "string, juste le nombre si un prix maximum/budget est mentionné (ex: '200'), vide sinon",
  "resume_confirmation": "UNE courte phrase naturelle confirmant ce que tu as compris, ex: 'Je cherche des frigos à moins de 200 dollars à Mudzipela'"
}

Règles :
- Si la personne dit juste un objet ("un frigo", "une moto") sans plus de précision → categorie vide, juste les mots-clés
- Ne jamais halluciner un quartier ou un prix qui n'a pas été dit
- "mots_cles" doit toujours être rempli avec quelque chose d'utile pour chercher
- Réponds UNIQUEMENT le JSON, sans markdown, sans texte avant/après`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { texte } = req.body || {};
  if (!texte || texte.trim().length < 2) {
    return res.status(400).json({ error: "Texte insuffisant" });
  }

  const cle = process.env.GOOGLE_API_KEY;
  if (!cle) {
    return res.status(500).json({ error: "GOOGLE_API_KEY manquante côté serveur" });
  }

  try {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: PROMPT_SYSTEME }] },
          contents: [{ parts: [{ text: `Recherche vocale à interpréter :\n\n"${texte}"` }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );

    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur API Gemini");

    const texteBrut = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const extrait = JSON.parse(texteBrut);

    if (extrait.categorie && !CATEGORIES_CONNUES.includes(extrait.categorie)) {
      extrait.categorie = "";
    }

    return res.status(200).json({ extrait });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
