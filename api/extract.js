// ============================================
// API SERVERLESS (Vercel) — Extraction structurée
// Reçoit le texte transcrit (potentiellement en mélange FR/lingala/swahili)
// et en extrait les champs nécessaires pour publier une annonce Djema :
//   titre, description, prix, quartier, categorie, sous_categorie, etat_produit
//
// Utilise l'API Anthropic (Claude) — c'est le "cerveau agentique" :
// il ne transcrit pas, il COMPREND et STRUCTURE.
//
// À configurer dans Vercel : Project Settings → Environment Variables
//   ANTHROPIC_API_KEY
// ============================================

const CATEGORIES_CONNUES = ["Vente", "Recherche", "Emploi", "Service"];

const PROMPT_SYSTEME = `Tu es un assistant qui transforme une transcription vocale informelle (en français, lingala, swahili, ou un mélange des trois) en une annonce structurée pour Djema, une marketplace de petites annonces à Bunia (RDC).

Réponds UNIQUEMENT en JSON, sans aucun texte avant ou après, sans markdown, avec exactement cette structure :
{
  "titre": "string court et clair (max 60 caractères)",
  "description": "string, reformulation claire et complète de ce qui a été dit",
  "prix": "string, juste le nombre si possible (ex: '200' ou '200000'), vide si non mentionné",
  "quartier": "string, le nom du quartier/lieu mentionné, vide si non mentionné",
  "categorie": "une seule valeur parmi: Vente, Recherche, Emploi, Service",
  "sous_categorie": "string libre si déductible (ex: Électronique, Mécanique), sinon vide",
  "etat_produit": "une seule valeur parmi: Neuf, Très bon état, Usé, Très abîmé — UNIQUEMENT si categorie=Vente et que l'état est mentionné ou déductible, sinon vide",
  "confiance": "un nombre entre 0 et 1 représentant ta confiance globale dans l'extraction",
  "champs_manquants": ["liste des champs importants non mentionnés dans l'audio, ex: 'prix', 'quartier'"]
}

Règles :
- Si la personne dit "je cherche un travail" ou décrit ses compétences → categorie = "Emploi"
- Si la personne dit "je vends" ou décrit un objet à vendre → categorie = "Vente"
- Si la personne cherche à acheter quelque chose → categorie = "Recherche"
- Si la personne propose un service (réparation, cours, transport...) → categorie = "Service"
- Ne jamais halluciner un prix ou un quartier qui n'a pas été dit
- Le texte peut mélanger plusieurs langues, comprends le sens global avant de structurer`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { texte } = req.body || {};
  if (!texte || texte.trim().length < 3) {
    return res.status(400).json({ error: "Texte insuffisant pour l'extraction" });
  }

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante côté serveur" });
  }

  try {
    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: PROMPT_SYSTEME,
        messages: [{ role: "user", content: `Transcription à structurer :\n\n"${texte}"` }],
      }),
    });

    const data = await reponse.json();
    if (!reponse.ok) {
      throw new Error(data.error?.message || "Erreur API Anthropic");
    }

    const texteBrut = data.content?.[0]?.text || "{}";
    const nettoye = texteBrut.replace(/```json|```/g, "").trim();
    const extrait = JSON.parse(nettoye);

    // Sécurité : on force la catégorie à rester dans la liste connue
    if (!CATEGORIES_CONNUES.includes(extrait.categorie)) {
      extrait.categorie = "Vente";
      extrait.confiance = Math.min(extrait.confiance ?? 0.5, 0.5);
    }

    return res.status(200).json({ extrait });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
