// ============================================
// API SERVERLESS (Vercel) — Extraction structurée
// Reçoit le texte transcrit (potentiellement en mélange FR/lingala/swahili)
// et en extrait les champs nécessaires pour publier une annonce Djema :
//   titre, description, prix, quartier, categorie, sous_categorie, etat_produit
//
// Utilise Gemini (Google) — gratuit, aucune carte bancaire requise.
// C'est le "cerveau agentique" : il ne transcrit pas, il COMPREND,
// STRUCTURE, et détecte ce qui manque pour poser la bonne question.
//
// À configurer dans Vercel : Project Settings → Environment Variables
//   GOOGLE_API_KEY   (la même clé que pour la transcription Gemini)
// ============================================

const CATEGORIES_CONNUES = ["Vente", "Recherche", "Emploi", "Service"];

const PROMPT_SYSTEME = `Tu es l'agent Djema Voice. Ton rôle : transformer une transcription vocale informelle (français, lingala, swahili, ou un mélange des trois — le "code-switching" africain) en une annonce structurée pour Djema, une marketplace de petites annonces à Bunia (RDC).

Tu ne te contentes pas de transcrire, tu COMPRENDS l'intention derrière les mots, même mélangés.

Réponds UNIQUEMENT en JSON valide, exactement cette structure :
{
  "titre": "string court et clair (max 60 caractères)",
  "description": "string, reformulation claire et complète de ce qui a été dit",
  "prix": "string, juste le nombre si possible (ex: '200'), vide si non mentionné",
  "quartier": "string, le nom du quartier/lieu mentionné, vide si non mentionné",
  "categorie": "une seule valeur parmi: Vente, Recherche, Emploi, Service",
  "sous_categorie": "string libre si déductible (ex: Électronique, Mécanique), sinon vide",
  "etat_produit": "une seule valeur parmi: Neuf, Très bon état, Usé, Très abîmé — UNIQUEMENT si categorie=Vente et que l'état est mentionné ou déductible, sinon vide",
  "confiance": "nombre entre 0 et 1, ta confiance globale dans l'extraction",
  "champs_manquants": ["liste des champs importants absents, ex: 'prix', 'quartier'"],
  "resume_confirmation": "UNE phrase naturelle en français qui reformule ce que tu as compris, à présenter à l'utilisateur pour confirmation. Exemple : 'J'ai compris que tu cherches un emploi de mécanicien à Bigo, avec 3 ans d'expérience, disponible immédiatement.'"
}

Règles :
- Si la personne dit "je cherche un travail" ou décrit ses compétences → categorie = "Emploi"
- Si la personne dit "je vends" ou décrit un objet à vendre → categorie = "Vente"
- Si la personne cherche à acheter quelque chose → categorie = "Recherche"
- Si la personne propose un service (réparation, cours, transport...) → categorie = "Service"
- Ne jamais halluciner un prix ou un quartier qui n'a pas été dit
- "resume_confirmation" doit toujours être rempli, même si des champs manquent
- Réponds UNIQUEMENT le JSON, sans markdown, sans texte avant/après`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { texte } = req.body || {};
  if (!texte || texte.trim().length < 3) {
    return res.status(400).json({ error: "Texte insuffisant pour l'extraction" });
  }

  const cle = process.env.GOOGLE_API_KEY;
  if (!cle) {
    return res.status(500).json({ error: "GOOGLE_API_KEY manquante côté serveur" });
  }

  try {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: PROMPT_SYSTEME }] },
          contents: [{ parts: [{ text: `Transcription à structurer :\n\n"${texte}"` }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      }
    );

    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.error?.message || "Erreur API Gemini");

    const texteBrut = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const extrait = JSON.parse(texteBrut);

    if (!CATEGORIES_CONNUES.includes(extrait.categorie)) {
      extrait.categorie = "Vente";
      extrait.confiance = Math.min(extrait.confiance ?? 0.5, 0.5);
    }

    return res.status(200).json({ extrait });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
