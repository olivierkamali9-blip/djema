// ============================================
// DJEMA — Fonctions de connexion aux données
// Toutes les actions de l'app (inscription, publier, lire, contacter...)
// passent par ces fonctions, qui parlent à Supabase.
// ============================================

import { supabase } from "./supabaseClient";

// ---------- AUTHENTIFICATION ----------

// Inscription par email + mot de passe
export async function inscriptionParEmail(email, motDePasse, nom, quartier) {
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse });
  if (error) return { error };

  // Une fois le compte créé, on enregistre son profil dans la table utilisateurs
  const { error: erreurProfil } = await supabase.from("utilisateurs").insert({
    id: data.user.id,
    nom,
    email,
    quartier,
  });
  return { data, error: erreurProfil };
}

// Connexion par email + mot de passe
export async function connexionParEmail(email, motDePasse) {
  return await supabase.auth.signInWithPassword({ email, password: motDePasse });
}

// Étape 1 : envoyer un code SMS au numéro de téléphone
export async function envoyerCodeSMS(telephone) {
  return await supabase.auth.signInWithOtp({ phone: telephone });
}

// Étape 2 : vérifier le code reçu par SMS
export async function verifierCodeSMS(telephone, code) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: telephone,
    token: code,
    type: "sms",
  });
  return { data, error };
}

// Déconnexion
export async function deconnexion() {
  return await supabase.auth.signOut();
}

// Récupérer l'utilisateur actuellement connecté
export async function utilisateurActuel() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// ---------- ANNONCES ----------

// Récupérer le flux d'annonces actives (avec infos du vendeur)
export async function recupererAnnonces({ categorieId, quartier } = {}) {
  let requete = supabase
    .from("annonces")
    .select("*, utilisateurs(nom, photo_url, note_moyenne, quartier)")
    .eq("statut", "active")
    .order("date_publication", { ascending: false });

  if (categorieId) requete = requete.eq("categorie_id", categorieId);
  if (quartier) requete = requete.eq("quartier", quartier);

  return await requete;
}

// Récupérer une seule annonce en détail
export async function recupererAnnonce(annonceId) {
  return await supabase
    .from("annonces")
    .select("*, utilisateurs(nom, photo_url, note_moyenne, nb_avis, quartier, telephone_verifie)")
    .eq("id", annonceId)
    .single();
}

// Publier une nouvelle annonce
export async function publierAnnonce(annonce) {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  return await supabase.from("annonces").insert({
    ...annonce,
    utilisateur_id: utilisateur.id,
  });
}

// Marquer une annonce comme vendue
export async function marquerVendu(annonceId, venduA = null) {
  return await supabase
    .from("annonces")
    .update({ statut: "vendu", vendu_a: venduA })
    .eq("id", annonceId);
}

// Récupérer les annonces d'un utilisateur (pour "Mes annonces")
export async function recupererMesAnnonces() {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  return await supabase
    .from("annonces")
    .select("*")
    .eq("utilisateur_id", utilisateur.id)
    .order("date_publication", { ascending: false });
}

// Enregistrer une vue sur une annonce (pour les stats + future IA)
export async function enregistrerVue(annonceId) {
  const utilisateur = await utilisateurActuel();
  await supabase.from("interactions").insert({
    utilisateur_id: utilisateur?.id ?? null,
    annonce_id: annonceId,
    type: "vue",
  });
  // Incrémente le compteur de vues sur l'annonce elle-même
  await supabase.rpc("incrementer_vues", { annonce_id_param: annonceId });
}

// ---------- MESSAGERIE ----------

// Créer ou récupérer une conversation pour une annonce donnée
export async function demarrerConversation(annonceId, vendeurId) {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  const { data: existante } = await supabase
    .from("conversations")
    .select("*")
    .eq("annonce_id", annonceId)
    .eq("acheteur_id", utilisateur.id)
    .single();

  if (existante) return { data: existante };

  return await supabase
    .from("conversations")
    .insert({ annonce_id: annonceId, acheteur_id: utilisateur.id, vendeur_id: vendeurId })
    .select()
    .single();
}

// Récupérer la liste des conversations de l'utilisateur
export async function recupererConversations() {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  return await supabase
    .from("conversations")
    .select("*, annonces(titre, prix, photos), messages(contenu, date_envoi, lu, expediteur_id)")
    .or(`acheteur_id.eq.${utilisateur.id},vendeur_id.eq.${utilisateur.id}`)
    .order("date_creation", { ascending: false });
}

// Envoyer un message dans une conversation
export async function envoyerMessage(conversationId, contenu) {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  return await supabase.from("messages").insert({
    conversation_id: conversationId,
    expediteur_id: utilisateur.id,
    contenu,
  });
}

// Récupérer les messages d'une conversation
export async function recupererMessages(conversationId) {
  return await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("date_envoi", { ascending: true });
}

// S'abonner en temps réel aux nouveaux messages d'une conversation
export function ecouterNouveauxMessages(conversationId, surNouveauMessage) {
  return supabase
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => surNouveauMessage(payload.new)
    )
    .subscribe();
}

// ---------- AVIS ----------

// Laisser un avis (seulement possible après un échange via messagerie)
export async function laisserAvis(utilisateurNoteId, conversationId, note, commentaire) {
  const utilisateur = await utilisateurActuel();
  if (!utilisateur) return { error: "Non connecté" };

  return await supabase.from("avis").insert({
    utilisateur_note_id: utilisateurNoteId,
    utilisateur_auteur_id: utilisateur.id,
    conversation_id: conversationId,
    note,
    commentaire,
  });
}

// Récupérer les avis reçus par un utilisateur
export async function recupererAvis(utilisateurId) {
  return await supabase
    .from("avis")
    .select("*, utilisateurs!avis_utilisateur_auteur_id_fkey(nom)")
    .eq("utilisateur_note_id", utilisateurId)
    .order("date_creation", { ascending: false });
}

// ---------- CATÉGORIES ----------

export async function recupererCategories() {
  return await supabase.from("categories").select("*").order("ordre");
}
