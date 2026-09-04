// ============================================
// API SERVERLESS (Vercel) — Extraction structurée par fusion multi-modèles
// Reçoit LES 3 transcriptions (Sahara, Whisper, Gemini) de la même phrase,
// les fait croiser par Gemini pour reconstruire la version la plus fiable,
// puis en extrait les champs Djema : titre, description, prix, quartier,
// categorie, sous_categorie, etat_produit.
//
// Pourquoi croiser les 3 plutôt que d'en choisir un seul :
// chaque modèle se trompe différemment (un chiffre mal entendu ici, un nom
// de lieu déformé là) — recouper les versions donne un résultat plus fiable
// qu'un seul modèle seul, même le meilleur.
//
// Utilise Gemini (Google) — gratuit, aucune carte bancaire requise.
// À configurer dans Vercel : Project Settings → Environment Variables
//   GOOGLE_API_KEY   (la même clé que pour la transcription Gemini)
// ============================================

const CATEGORIES_CONNUES = ["Vente", "Recherche", "Emploi", "Service"];

const PROMPT_SYSTEME = `Tu es l'agent Djema Voice. On te donne PLUSIEURS transcriptions différentes du MÊME enregistrement audio, produites par 3 modèles vocaux différents (Sahara, Whisper, Gemini). Chaque modèle se trompe différemment sur un audio en français/lingala/swahili mélangés (le "code-switching" africain).

Ton travail :
1. Compare les 3 transcriptions entre elles pour repérer ce qui est probablement correct (ex: si 2 modèles sur 3 s'accordent sur un chiffre ou un nom de lieu, c'est probablement le bon)
2. Reconstruis la phrase la plus fidèle possible à ce qui a été réellement dit
3. Extrait les champs structurés pour une annonce Djema (marketplace à Bunia, RDC)

Réponds UNIQUEMENT en JSON valide, exactement cette structure :
{
  "transcription_reconciliee": "ta meilleure reconstruction de ce qui a été dit, après avoir comparé les 3 versions",
  "titre": "string court et clair (max 60 caractères)",
  "description": "string, reformulation claire et complète",
  "prix": "string, juste le nombre si possible (ex: '200'), vide si non mentionné dans AUCUNE des 3 versions",
  "quartier": "string, le nom du quartier/lieu, vide si non mentionné",
  "categorie": "une seule valeur parmi: Vente, Recherche, Emploi, Service",
  "sous_categorie": "string libre si déductible, sinon vide",
  "etat_produit": "une seule valeur parmi: Neuf, Très bon état, Usé, Très abîmé — UNIQUEMENT si categorie=Vente, sinon vide",
  "confiance": "nombre entre 0 et 1 — BAISSE ce score si les 3 transcriptions se contredisent beaucoup",
  "champs_manquants": ["champs importants absents des 3 transcriptions"],
  "resume_confirmation": "UNE phrase naturelle en français reformulant ce que tu as compris, pour confirmation utilisateur"
}

Règles :
- Ne jamais halluciner un prix ou un lieu qu'AUCUNE des 3 transcriptions ne mentionne
- Si les 3 versions donnent des chiffres différents pour le prix, choisis celui que 2 modèles partagent ; si les 3 diffèrent, mets le champ dans "champs_manquants" plutôt que de deviner
- Si la personne dit "je cherche un travail" ou décrit ses compétences → categorie = "Emploi"
- Si la personne dit "je vends"/décrit un objet à vendre → categorie = "Vente"
- Si la personne cherche à acheter → categorie = "Recherche"
- Si la personne propose un service → categorie = "Service"
- Réponds UNIQUEMENT le JSON, sans markdown, sans texte avant/après`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { transcriptions } = req.body || {};
  const valides = (transcriptions || []).filter((t) => t.texte && t.texte.trim().length > 0);

  if (valides.length === 0) {
    return res.status(400).json({ error: "Aucune transcription valide à extraire" });
  }

  const cle = process.env.GOOGLE_API_KEY;
  if (!cle) {
    return res.status(500).json({ error: "GOOGLE_API_KEY manquante côté serveur" });
  }

  const blocTranscriptions = valides
    .map((t) => `--- Transcription de "${t.modele}" ---\n"${t.texte}"`)
    .join("\n\n");

  try {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: PROMPT_SYSTEME }] },
          contents: [{ parts: [{ text: `Voici les transcriptions à comparer et fusionner :\n\n${blocTranscriptions}` }] }],
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
