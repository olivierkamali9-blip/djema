import React, { useState, useEffect } from "react";
import { Search, SlidersHorizontal, Heart, MessageCircle, MapPin, Home, PlusCircle, User, Inbox, ArrowLeft, Phone, Mail, ArrowRight, Star, ShieldCheck, Eye, Send, Camera, X, Settings, Grid3x3, MessageSquareText, CheckCircle2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import {
  inscriptionParEmail, connexionParEmail, deconnexion, utilisateurActuel,
  recupererAnnonces, recupererAnnonce, publierAnnonce, recupererMesAnnonces,
  enregistrerVue, demarrerConversation, recupererConversations, envoyerMessage,
  recupererMessages, ecouterNouveauxMessages, recupererCategories,
  recupererProfil, mettreAJourProfil, envoyerPhoto, marquerVendu, laisserAvis,
  modifierAnnonce, supprimerAnnonce, supprimerMessage, supprimerConversation, supprimerCompte,
} from "./lib/djemaApi";

// ============================================
// DJEMA — Application complète
// Navigation simple par état (pas de react-router, adapté à une PWA légère)
// ============================================

const CATEGORIES_LABELS = ["Tout", "Vente", "Recherche", "Emploi", "Service"];

export default function DjemaApp() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [ecran, setEcran] = useState("accueil"); // accueil | detail | publier | messagerie | profil | mesAnnonces
  const [annonceOuverte, setAnnonceOuverte] = useState(null);
  const [conversationOuverte, setConversationOuverte] = useState(null);

  useEffect(() => {
    utilisateurActuel().then((u) => {
      setUtilisateur(u);
      setChargement(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUtilisateur(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Demander la permission de notification et écouter les nouveaux messages globalement
  useEffect(() => {
    if (!utilisateur) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const canal = supabase
      .channel("messages-globaux")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new;
          if (m.expediteur_id === utilisateur.id) return; // pas de notif pour ses propres messages
          const { data: conv } = await supabase
            .from("conversations")
            .select("acheteur_id, vendeur_id")
            .eq("id", m.conversation_id)
            .single();
          if (!conv) return;
          const concerne = conv.acheteur_id === utilisateur.id || conv.vendeur_id === utilisateur.id;
          if (!concerne) return;
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Nouveau message sur Djema", { body: m.contenu, icon: "/icon-192.png" });
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, [utilisateur?.id]);

  if (chargement) {
    return (
      <div className="min-h-screen bg-[#1B3B2F] flex items-center justify-center">
        <span className="text-[#E8A93E] font-bold tracking-[0.2em]">DJEMA</span>
      </div>
    );
  }

  if (!utilisateur) {
    return <EcranAuth onConnecte={setUtilisateur} />;
  }

  return (
    <div className="min-h-screen bg-[#1B3B2F] flex items-center justify-center p-0 sm:p-6">
      <div className="w-full max-w-[420px] h-screen sm:h-[880px] bg-[#FAF6EF] sm:rounded-[2.5rem] overflow-hidden relative shadow-2xl flex flex-col">
        {ecran === "accueil" && (
          <EcranAccueil
            onOuvrirAnnonce={(a) => { setAnnonceOuverte(a); setEcran("detail"); }}
            onNaviguer={setEcran}
          />
        )}
        {ecran === "detail" && (
          <EcranDetail
            annonce={annonceOuverte}
            utilisateur={utilisateur}
            onRetour={() => setEcran("accueil")}
            onOuvrirMessagerie={(conv) => { setConversationOuverte(conv); setEcran("messagerie"); }}
          />
        )}
        {ecran === "publier" && (
          <EcranPublier utilisateur={utilisateur} onPublie={() => setEcran("accueil")} onRetour={() => setEcran("accueil")} />
        )}
        {ecran === "messagerie" && (
          <EcranMessagerie
            conversationOuverte={conversationOuverte}
            onOuvrirConversation={setConversationOuverte}
            onRetour={() => setEcran("accueil")}
          />
        )}
        {ecran === "profil" && (
          <EcranProfil utilisateur={utilisateur} onDeconnexion={async () => { await deconnexion(); }} onNaviguer={setEcran} />
        )}
        {ecran === "mesAnnonces" && <EcranMesAnnonces onRetour={() => setEcran("profil")} />}

        {["accueil", "messagerie", "profil"].includes(ecran) && !(ecran === "messagerie" && conversationOuverte) && (
          <NavigationBas ecranActif={ecran} onNaviguer={setEcran} />
        )}
      </div>
    </div>
  );
}

// ---------- AUTHENTIFICATION ----------
function EcranAuth({ onConnecte }) {
  const [mode, setMode] = useState("choix");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nom, setNom] = useState("");
  const [quartier, setQuartier] = useState("");
  const [ville, setVille] = useState("Bunia");
  const [erreur, setErreur] = useState("");
  const [inscription, setInscription] = useState(false);

  const soumettre = async () => {
    setErreur("");
    if (inscription) {
      const { data, error } = await inscriptionParEmail(email, motDePasse, nom, quartier, ville);
      if (error) return setErreur(error.message);
      onConnecte(data.user);
    } else {
      const { data, error } = await connexionParEmail(email, motDePasse);
      if (error) return setErreur(error.message);
      onConnecte(data.user);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B3B2F] flex items-center justify-center p-0 sm:p-6">
      <div className="w-full max-w-[420px] h-screen sm:h-[880px] bg-[#1B3B2F] sm:rounded-[2.5rem] overflow-hidden relative shadow-2xl flex flex-col">
        {mode === "choix" && (
          <div className="flex-1 flex flex-col justify-between px-7 pt-16 pb-10">
            <div>
              <div className="w-16 h-16 rounded-2xl bg-[#E8A93E] flex items-center justify-center mb-6">
                <span className="text-2xl font-black text-[#1B3B2F]">D</span>
              </div>
              <h1 className="text-3xl font-black text-[#FAF6EF] leading-tight">Bienvenue<br />sur Djema</h1>
              <p className="text-[#9BB0A5] text-[15px] mt-3 leading-relaxed">
                Achète, vends et trouve ce dont tu as besoin, directement dans ton quartier à Bunia.
              </p>
            </div>
            <div className="space-y-3">
              <button onClick={() => setMode("email")} className="w-full flex items-center justify-center gap-2.5 bg-[#E8A93E] text-[#1B3B2F] font-bold text-[15px] py-4 rounded-full active:scale-95 transition-transform">
                <Mail className="w-4 h-4" strokeWidth={2.5} />
                Continuer avec mon email
              </button>
              <p className="text-center text-[11px] text-[#7A9186] mt-2 px-4 leading-relaxed">
                La connexion par téléphone (SMS) sera activée dès que le service SMS de Supabase sera configuré sur ton projet.
              </p>
            </div>
          </div>
        )}

        {mode === "email" && (
          <div className="flex-1 flex flex-col px-7 pt-16 pb-10">
            <button onClick={() => setMode("choix")} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center mb-8">
              <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
            </button>
            <h1 className="text-2xl font-black text-[#FAF6EF] leading-tight">{inscription ? "Créer un compte" : "Connexion"}</h1>
            <p className="text-[#9BB0A5] text-[14px] mt-2 mb-6">{inscription ? "Quelques infos pour commencer" : "Entre ton email et ton mot de passe"}</p>

            <div className="space-y-3">
              {inscription && (
                <>
                  <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ton nom" className="w-full bg-[#254539] rounded-2xl px-4 py-4 text-[#FAF6EF] placeholder:text-[#7A9186] outline-none text-[15px]" />
                  <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ta ville" className="w-full bg-[#254539] rounded-2xl px-4 py-4 text-[#FAF6EF] placeholder:text-[#7A9186] outline-none text-[15px]" />
                  <input value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Ton quartier" className="w-full bg-[#254539] rounded-2xl px-4 py-4 text-[#FAF6EF] placeholder:text-[#7A9186] outline-none text-[15px]" />
                </>
              )}
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse email" className="w-full bg-[#254539] rounded-2xl px-4 py-4 text-[#FAF6EF] placeholder:text-[#7A9186] outline-none text-[15px]" />
              <input value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} type="password" placeholder="Mot de passe" className="w-full bg-[#254539] rounded-2xl px-4 py-4 text-[#FAF6EF] placeholder:text-[#7A9186] outline-none text-[15px]" />
            </div>

            {erreur && <p className="text-[#E8A93E] text-[13px] mt-3">{erreur}</p>}

            <button onClick={soumettre} className="mt-auto w-full flex items-center justify-center gap-2 bg-[#E8A93E] text-[#1B3B2F] font-bold text-[15px] py-4 rounded-full active:scale-95 transition-transform">
              {inscription ? "Créer mon compte" : "Se connecter"}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button onClick={() => setInscription(!inscription)} className="text-center text-[13px] text-[#9BB0A5] mt-4">
              {inscription ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ACCUEIL ----------
function EcranAccueil({ onOuvrirAnnonce, onNaviguer }) {
  const [annonces, setAnnonces] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categorieActive, setCategorieActive] = useState("Tout");
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [quartierFiltre, setQuartierFiltre] = useState("");
  const [prixMax, setPrixMax] = useState("");

  useEffect(() => {
    recupererCategories().then(({ data }) => setCategories(data || []));
    recupererAnnonces().then(({ data, error }) => {
      if (!error) setAnnonces(data || []);
      setChargement(false);
    });
  }, []);

  const categorieActiveId = categories.find((c) => c.nom === categorieActive && !c.categorie_parent_id)?.id;
  const filtrees = annonces
    .filter((a) => categorieActive === "Tout" || a.categorie_id === categorieActiveId)
    .filter((a) => !recherche || a.titre.toLowerCase().includes(recherche.toLowerCase()) || a.description?.toLowerCase().includes(recherche.toLowerCase()))
    .filter((a) => !quartierFiltre || a.quartier.toLowerCase().includes(quartierFiltre.toLowerCase()))
    .filter((a) => !prixMax || parseInt((a.prix || "0").replace(/\D/g, "")) <= parseInt(prixMax || "999999999"));

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-[#254539] rounded-full px-4 py-2.5">
            <Search className="w-4 h-4 text-[#9BB0A5]" strokeWidth={2.5} />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit, un service..." className="bg-transparent text-sm text-[#FAF6EF] placeholder:text-[#7A9186] outline-none flex-1 min-w-0" />
          </div>
          <button onClick={() => setFiltresOuverts(!filtresOuverts)} className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform ${filtresOuverts || quartierFiltre || prixMax ? "bg-[#E8A93E]" : "bg-[#B5541F]"}`}>
            <SlidersHorizontal className="w-4 h-4 text-[#1B3B2F]" strokeWidth={2.5} />
          </button>
        </div>

        {filtresOuverts && (
          <div className="mt-3 bg-[#254539] rounded-2xl p-3.5 space-y-2.5">
            <input value={quartierFiltre} onChange={(e) => setQuartierFiltre(e.target.value)} placeholder="Filtrer par quartier" className="w-full bg-[#1B3B2F] rounded-xl px-3.5 py-2.5 text-[13px] text-[#FAF6EF] placeholder:text-[#7A9186] outline-none" />
            <input value={prixMax} onChange={(e) => setPrixMax(e.target.value)} placeholder="Prix maximum" className="w-full bg-[#1B3B2F] rounded-xl px-3.5 py-2.5 text-[13px] text-[#FAF6EF] placeholder:text-[#7A9186] outline-none" />
            {(quartierFiltre || prixMax) && (
              <button onClick={() => { setQuartierFiltre(""); setPrixMax(""); }} className="text-[12px] font-semibold text-[#E8A93E]">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3.5 overflow-x-auto no-scrollbar -mx-5 px-5">
          {CATEGORIES_LABELS.map((cat) => (
            <button key={cat} onClick={() => setCategorieActive(cat)} className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold tracking-wide transition-colors ${categorieActive === cat ? "bg-[#E8A93E] text-[#1B3B2F]" : "bg-[#254539] text-[#C9D6CE]"}`}>
              {cat}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-4">
        {chargement && <p className="text-center text-[#8A9A91] text-[13px] pt-10">Chargement des annonces...</p>}
        {!chargement && filtrees.length === 0 && (
          <p className="text-center text-[#8A9A91] text-[13px] pt-10">Aucune annonce ne correspond — essaie d'élargir ta recherche.</p>
        )}
        {filtrees.map((a) => (
          <article key={a.id} onClick={() => onOuvrirAnnonce(a)} className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_16px_rgba(27,59,47,0.08)] border border-[#EFE9DB] cursor-pointer">
            <div className="relative">
              {a.photos?.[0] ? (
                <img src={a.photos[0]} alt={a.titre} className="w-full h-52 object-cover" />
              ) : (
                <div className="w-full h-52 bg-[#F0EFE6] flex items-center justify-center">
                  <Camera className="w-8 h-8 text-[#C9BFA8]" strokeWidth={1.5} />
                </div>
              )}
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-[#1B3B2F]/85 backdrop-blur-sm rounded-full pl-2 pr-3 py-1">
                <MapPin className="w-3 h-3 text-[#E8A93E]" strokeWidth={2.5} />
                <span className="text-[11px] font-semibold text-[#FAF6EF]">{a.quartier}</span>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-[#232323] text-[15px] leading-snug truncate">{a.titre}</h3>
              <p className="text-[#B5541F] font-extrabold text-lg mt-0.5">{a.prix}</p>
              <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-[#F0EFE6]">
                <span className="text-[12px] font-medium text-[#5C7268]">{a.utilisateurs?.nom || "Vendeur"}</span>
                <button className="flex items-center gap-1.5 bg-[#1B3B2F] text-[#FAF6EF] text-[12px] font-bold px-3.5 py-2 rounded-full">
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                  Voir
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

// ---------- DÉTAIL ANNONCE ----------
function EcranDetail({ annonce, utilisateur, onRetour, onOuvrirMessagerie }) {
  const [numero, setNumero] = useState("");
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    if (annonce?.id) enregistrerVue(annonce.id);
  }, [annonce?.id]);

  if (!annonce) return null;

  const contacterViaMessagerie = async () => {
    const { data } = await demarrerConversation(annonce.id, annonce.utilisateur_id);
    onOuvrirMessagerie(data);
  };

  return (
    <>
      <div className="relative h-80 shrink-0 bg-[#1B3B2F]">
        {annonce.photos?.[0] ? (
          <img src={annonce.photos[0]} alt={annonce.titre} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Camera className="w-10 h-10 text-[#4A6356]" strokeWidth={1.5} />
          </div>
        )}
        <button onClick={onRetour} className="absolute top-10 left-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-5">
        <h1 className="text-xl font-bold text-[#232323] leading-snug">{annonce.titre}</h1>
        <p className="text-[#B5541F] font-extrabold text-2xl mt-1.5">{annonce.prix}</p>
        <div className="flex items-center gap-1.5 mt-2 text-[#5C7268]">
          <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span className="text-[13px] font-medium">{annonce.quartier}</span>
        </div>
        <div className="mt-5 pt-5 border-t border-[#EFE9DB]">
          <h2 className="text-[13px] font-bold text-[#232323] uppercase tracking-wide mb-2">Description</h2>
          <p className="text-[14px] text-[#4A5450] leading-relaxed">{annonce.description}</p>
        </div>
        <div className="mt-5 pt-5 border-t border-[#EFE9DB]">
          <h2 className="text-[13px] font-bold text-[#232323] uppercase tracking-wide mb-3">Vendeur</h2>
          <div className="bg-white rounded-2xl p-4 border border-[#EFE9DB] flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#E8A93E] flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-[#1B3B2F]">{(annonce.utilisateurs?.nom || "V").charAt(0)}</span>
            </div>
            <div>
              <p className="font-bold text-[#232323] text-[14px]">{annonce.utilisateurs?.nom}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3 h-3 fill-[#E8A93E] text-[#E8A93E]" />
                <span className="text-[12px] font-semibold text-[#5C7268]">{annonce.utilisateurs?.note_moyenne || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#EFE9DB] px-5 pt-3 pb-6">
        {!showContact ? (
          <div className="flex gap-3">
            <button onClick={() => setShowContact(true)} className="flex-1 flex items-center justify-center gap-2 bg-[#FAF6EF] border-2 border-[#1B3B2F] text-[#1B3B2F] font-bold text-[14px] py-3 rounded-full">
              <Phone className="w-4 h-4" strokeWidth={2.5} />
              Laisser mon numéro
            </button>
            <button onClick={contacterViaMessagerie} className="flex-1 flex items-center justify-center gap-2 bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[14px] py-3 rounded-full">
              <MessageCircle className="w-4 h-4" strokeWidth={2.5} />
              Message
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Votre numéro" className="flex-1 bg-[#F0EFE6] rounded-full px-4 py-3 text-[14px] outline-none" />
            <button className="bg-[#B5541F] text-[#FAF6EF] font-bold text-[14px] px-5 rounded-full">Envoyer</button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- PUBLIER ----------
const ETATS = ["Neuf", "Très bon état", "Usé", "Très abîmé"];

function EcranPublier({ utilisateur, onPublie, onRetour }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [prix, setPrix] = useState("");
  const [quartier, setQuartier] = useState("");
  const [categorieId, setCategorieId] = useState(null);
  const [sousCategorieId, setSousCategorieId] = useState(null);
  const [etat, setEtat] = useState("Très bon état");
  const [categories, setCategories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    recupererCategories().then(({ data }) => setCategories(data || []));
  }, []);

  const categoriesPrincipales = categories.filter((c) => !c.categorie_parent_id);
  const categorieChoisie = categoriesPrincipales.find((c) => c.id === categorieId);
  const sousCategoriesDisponibles = categorieChoisie
    ? categories.filter((c) => c.categorie_parent_id === categorieChoisie.id)
    : [];
  const isVente = categorieChoisie?.nom === "Vente";
  const isEmploi = categorieChoisie?.nom === "Emploi";

  const choisirPhotos = async (e) => {
    const fichiers = Array.from(e.target.files).slice(0, 5 - photos.length);
    setEnvoiEnCours(true);
    for (const fichier of fichiers) {
      const { url, error } = await envoyerPhoto(fichier, "annonces");
      if (!error) setPhotos((prev) => [...prev, url]);
    }
    setEnvoiEnCours(false);
  };

  const retirerPhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const publier = async () => {
    setErreur("");
    if (!titre || !prix || !quartier || !categorieId) {
      setErreur("Merci de remplir au moins le titre, le prix, la catégorie et le quartier.");
      return;
    }
    const { error } = await publierAnnonce({
      titre, description, prix, quartier,
      categorie_id: categorieId,
      sous_categorie_id: sousCategorieId,
      etat_produit: isVente ? etat : null,
      photos,
      statut: "active",
    });
    if (error) return setErreur(error.message || "Une erreur est survenue");
    onPublie();
  };

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-4 shrink-0 flex items-center gap-3">
        <button onClick={onRetour} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
        </button>
        <h1 className="text-[#FAF6EF] font-bold text-base">Publier une annonce</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-28 space-y-4">
        {/* Catégorie */}
        <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide">Catégorie</label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {categoriesPrincipales.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCategorieId(c.id); setSousCategorieId(null); }}
              className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold ${categorieId === c.id ? "bg-[#B5541F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"}`}
            >
              {c.nom}
            </button>
          ))}
        </div>

        {/* Photos */}
        <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide block">Photos (5 max)</label>
        <div className="flex gap-2 flex-wrap">
          {photos.map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0">
              <img src={url} className="w-full h-full object-cover" alt="" />
              <button onClick={() => retirerPhoto(i)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center">
                <X className="w-3 h-3 text-white" strokeWidth={3} />
              </button>
            </div>
          ))}
          {photos.length < 5 && (
            <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#C9BFA8] flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer">
              <input type="file" accept="image/*" multiple className="hidden" onChange={choisirPhotos} />
              <Camera className="w-5 h-5 text-[#B5541F]" strokeWidth={2} />
              <span className="text-[10px] font-semibold text-[#8A9A91]">{envoiEnCours ? "Envoi..." : "Ajouter"}</span>
            </label>
          )}
        </div>

        {/* Sous-catégorie */}
        {sousCategoriesDisponibles.length > 0 && (
          <>
            <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide block">Sous-catégorie</label>
            <div className="flex gap-2 flex-wrap">
              {sousCategoriesDisponibles.map((s) => (
                <button key={s.id} onClick={() => setSousCategorieId(s.id)} className={`px-3.5 py-2 rounded-full text-[12px] font-bold ${sousCategorieId === s.id ? "bg-[#1B3B2F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"}`}>
                  {s.nom}
                </button>
              ))}
            </div>
          </>
        )}

        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={isEmploi ? "Ex: Électricien recherché" : "Titre de l'annonce"} className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Description" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none resize-none" />

        {/* État du produit - seulement Vente */}
        {isVente && (
          <>
            <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide block">État du produit</label>
            <div className="flex gap-2 flex-wrap">
              {ETATS.map((e) => (
                <button key={e} onClick={() => setEtat(e)} className={`px-3.5 py-2 rounded-full text-[12px] font-bold ${etat === e ? "bg-[#1B3B2F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"}`}>
                  {e}
                </button>
              ))}
            </div>
          </>
        )}

        <input value={prix} onChange={(e) => setPrix(e.target.value)} placeholder={isEmploi ? "Salaire / rémunération" : "Prix"} className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />
        <input value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Quartier / Commune" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />

        {erreur && <p className="text-[#B5541F] text-[13px] font-semibold">{erreur}</p>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#EFE9DB] px-5 pt-3 pb-6">
        <button onClick={publier} className="w-full bg-[#B5541F] text-[#FAF6EF] font-bold text-[15px] py-3.5 rounded-full active:scale-95 transition-transform">
          Publier l'annonce
        </button>
      </div>
    </>
  );
}

// ---------- MESSAGERIE ----------
function EcranMessagerie({ conversationOuverte, onOuvrirConversation, onRetour }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const [avisOuvert, setAvisOuvert] = useState(false);
  const [noteAvis, setNoteAvis] = useState(5);
  const [commentaireAvis, setCommentaireAvis] = useState("");
  const [avisEnvoye, setAvisEnvoye] = useState(false);

  useEffect(() => {
    if (!conversationOuverte) {
      recupererConversations().then(({ data }) => setConversations(data || []));
    }
  }, [conversationOuverte]);

  useEffect(() => {
    if (conversationOuverte) {
      recupererMessages(conversationOuverte.id).then(({ data }) => setMessages(data || []));
      const canal = ecouterNouveauxMessages(conversationOuverte.id, (m) => setMessages((prev) => [...prev, m]));
      return () => supabase.removeChannel(canal);
    }
  }, [conversationOuverte]);

  const envoyer = async () => {
    if (!texte.trim()) return;
    await envoyerMessage(conversationOuverte.id, texte);
    setTexte("");
  };

  const soumettreAvis = async () => {
    const autrePersonne = conversationOuverte.vendeur_id;
    const { error } = await laisserAvis(autrePersonne, conversationOuverte.id, noteAvis, commentaireAvis);
    if (!error) {
      setAvisEnvoye(true);
      setAvisOuvert(false);
    }
  };

  if (conversationOuverte) {
    return (
      <>
        <header className="bg-[#1B3B2F] px-4 pt-10 pb-4 shrink-0 flex items-center gap-3">
          <button onClick={() => onOuvrirConversation(null)} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
          </button>
          <p className="flex-1 text-[#FAF6EF] font-bold text-[14px] truncate">{conversationOuverte.annonces?.titre || "Conversation"}</p>
          {!avisEnvoye && (
            <button onClick={() => setAvisOuvert(!avisOuvert)} className="text-[11px] font-bold text-[#E8A93E]">
              Laisser un avis
            </button>
          )}
        </header>

        {avisOuvert && (
          <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-[#EFE9DB] shrink-0">
            <p className="text-[12px] font-bold text-[#232323] mb-2">Note ton échange</p>
            <div className="flex gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setNoteAvis(n)}>
                  <Star className={`w-6 h-6 ${n <= noteAvis ? "fill-[#E8A93E] text-[#E8A93E]" : "text-[#E0DCCC]"}`} />
                </button>
              ))}
            </div>
            <textarea value={commentaireAvis} onChange={(e) => setCommentaireAvis(e.target.value)} placeholder="Un commentaire (optionnel)" rows={2} className="w-full bg-[#F0EFE6] rounded-xl px-3 py-2 text-[13px] outline-none resize-none mb-2" />
            <button onClick={soumettreAvis} className="w-full bg-[#B5541F] text-[#FAF6EF] font-bold text-[13px] py-2.5 rounded-xl">
              Envoyer l'avis
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.expediteur_id === conversationOuverte.acheteur_id ? "justify-end" : "justify-start"} group`}>
              <div className="flex items-center gap-1.5">
                {m.expediteur_id === conversationOuverte.acheteur_id && (
                  <button
                    onClick={async () => { await supprimerMessage(m.id); setMessages((prev) => prev.filter((x) => x.id !== m.id)); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5 text-[#B0BAB4]" strokeWidth={2.5} />
                  </button>
                )}
                <div className="max-w-[75%] px-4 py-2.5 rounded-2xl bg-white border border-[#EFE9DB]">
                  <p className="text-[14px] text-[#232323]">{m.contenu}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 bg-white border-t border-[#EFE9DB] px-4 pt-3 pb-6 flex items-center gap-2">
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écrire un message..." className="flex-1 bg-[#F0EFE6] rounded-full px-4 py-2.5 text-[14px] outline-none" />
          <button onClick={envoyer} className="w-10 h-10 rounded-full bg-[#1B3B2F] flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-4 shrink-0">
        <h1 className="text-[#FAF6EF] font-bold text-lg">Messages</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
        {conversations.length === 0 && <p className="text-center text-[#8A9A91] text-[13px] pt-10">Aucune conversation pour l'instant</p>}
        {conversations.map((c) => (
          <div key={c.id} className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl">
            <button onClick={() => onOuvrirConversation(c)} className="flex-1 flex items-center gap-3 text-left min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-[#E8A93E] flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-[#1B3B2F]">{(c.annonces?.titre || "?").charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#232323] text-[14px] truncate">{c.annonces?.titre}</p>
                <p className="text-[12px] text-[#8A9A91] truncate">{c.annonces?.prix}</p>
              </div>
            </button>
            <button
              onClick={async () => {
                if (!confirm("Supprimer cette conversation ?")) return;
                await supprimerConversation(c.id);
                setConversations((prev) => prev.filter((x) => x.id !== c.id));
              }}
              className="shrink-0 p-1.5"
            >
              <X className="w-4 h-4 text-[#B0BAB4]" strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- PROFIL ----------
function EcranProfil({ utilisateur, onDeconnexion, onNaviguer }) {
  const [profil, setProfil] = useState(null);
  const [modeEdition, setModeEdition] = useState(false);
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [quartier, setQuartier] = useState("");
  const [ongletActif, setOngletActif] = useState("annonces");
  const [mesAnnonces, setMesAnnonces] = useState([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);

  const chargerProfil = () => {
    recupererProfil(utilisateur.id).then(({ data }) => {
      if (data) {
        setProfil(data);
        setNom(data.nom || "");
        setVille(data.ville || "");
        setQuartier(data.quartier || "");
      }
    });
  };

  useEffect(() => {
    chargerProfil();
    recupererMesAnnonces().then(({ data }) => setMesAnnonces(data || []));
  }, []);

  const sauvegarder = async () => {
    await mettreAJourProfil({ nom, ville, quartier });
    setModeEdition(false);
    chargerProfil();
  };

  const changerPhoto = async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    setEnvoiPhoto(true);
    const { url, error } = await envoyerPhoto(fichier, "avatars");
    if (!error) {
      await mettreAJourProfil({ photo_url: url });
      chargerProfil();
    }
    setEnvoiPhoto(false);
  };

  if (!profil) {
    return <div className="flex-1 flex items-center justify-center"><p className="text-[#8A9A91] text-[13px]">Chargement...</p></div>;
  }

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <label className="relative w-20 h-20 rounded-full bg-[#E8A93E] flex items-center justify-center shrink-0 border-4 border-[#254539] cursor-pointer overflow-hidden">
              {profil.photo_url ? (
                <img src={profil.photo_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-2xl font-black text-[#1B3B2F]">{(profil.nom || "U").charAt(0).toUpperCase()}</span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={changerPhoto} />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
            </label>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[#FAF6EF] font-black text-lg truncate">{profil.nom}</h1>
                {profil.telephone_verifie && <ShieldCheck className="w-4 h-4 text-[#4FBF8A] shrink-0" strokeWidth={2.5} />}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-3.5 h-3.5 fill-[#E8A93E] text-[#E8A93E]" />
                <span className="text-[13px] font-bold text-[#FAF6EF]">{profil.note_moyenne || 0}</span>
                <span className="text-[13px] text-[#9BB0A5]">({profil.nb_avis || 0} avis)</span>
              </div>
              <div className="flex items-center gap-1 mt-1 text-[#9BB0A5]">
                <MapPin className="w-3 h-3" strokeWidth={2.5} />
                <span className="text-[12px]">{profil.quartier}, {profil.ville}</span>
              </div>
            </div>
          </div>
          <button onClick={() => setModeEdition(!modeEdition)} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
          </button>
        </div>

        {modeEdition && (
          <div className="space-y-2.5 bg-[#254539] rounded-2xl p-4">
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="w-full bg-[#1B3B2F] rounded-xl px-3.5 py-2.5 text-[13px] text-[#FAF6EF] placeholder:text-[#7A9186] outline-none" />
            <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ville" className="w-full bg-[#1B3B2F] rounded-xl px-3.5 py-2.5 text-[13px] text-[#FAF6EF] placeholder:text-[#7A9186] outline-none" />
            <input value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Quartier" className="w-full bg-[#1B3B2F] rounded-xl px-3.5 py-2.5 text-[13px] text-[#FAF6EF] placeholder:text-[#7A9186] outline-none" />
            <button onClick={sauvegarder} className="w-full bg-[#E8A93E] text-[#1B3B2F] font-bold text-[13px] py-2.5 rounded-xl">
              Enregistrer
            </button>
          </div>
        )}
      </header>

      <div className="flex border-b border-[#EFE9DB] shrink-0 bg-white">
        <button onClick={() => setOngletActif("annonces")} className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 border-b-2 ${ongletActif === "annonces" ? "border-[#B5541F]" : "border-transparent"}`}>
          <Grid3x3 className={`w-4 h-4 ${ongletActif === "annonces" ? "text-[#B5541F]" : "text-[#B0BAB4]"}`} strokeWidth={2.5} />
          <span className={`text-[13px] font-bold ${ongletActif === "annonces" ? "text-[#B5541F]" : "text-[#B0BAB4]"}`}>Annonces ({mesAnnonces.length})</span>
        </button>
        <button onClick={() => setOngletActif("avis")} className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 border-b-2 ${ongletActif === "avis" ? "border-[#B5541F]" : "border-transparent"}`}>
          <MessageSquareText className={`w-4 h-4 ${ongletActif === "avis" ? "text-[#B5541F]" : "text-[#B0BAB4]"}`} strokeWidth={2.5} />
          <span className={`text-[13px] font-bold ${ongletActif === "avis" ? "text-[#B5541F]" : "text-[#B0BAB4]"}`}>Avis ({profil.nb_avis || 0})</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {ongletActif === "annonces" && (
          <div className="p-4">
            {mesAnnonces.length > 0 && (
              <button onClick={() => onNaviguer("mesAnnonces")} className="w-full bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[13px] py-3 rounded-2xl mb-3">
                Gérer mes annonces (modifier / supprimer)
              </button>
            )}
            <div className="grid grid-cols-2 gap-3">
              {mesAnnonces.length === 0 && <p className="col-span-2 text-center text-[#8A9A91] text-[13px] pt-6">Aucune annonce publiée pour l'instant</p>}
              {mesAnnonces.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl overflow-hidden border border-[#EFE9DB]">
                  {a.photos?.[0] ? (
                    <img src={a.photos[0]} alt={a.titre} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 bg-[#F0EFE6] flex items-center justify-center">
                      <Camera className="w-6 h-6 text-[#C9BFA8]" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-[12px] font-semibold text-[#232323] truncate">{a.titre}</p>
                    <p className="text-[13px] font-extrabold text-[#B5541F] mt-0.5">{a.prix}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {ongletActif === "avis" && (
          <div className="p-4">
            <p className="text-center text-[#8A9A91] text-[13px] pt-6">
              {profil.nb_avis > 0 ? "Chargement des avis..." : "Pas encore d'avis reçus"}
            </p>
          </div>
        )}

        <div className="px-4 mt-4 space-y-2">
          <button onClick={onDeconnexion} className="w-full bg-white border border-[#EFE9DB] rounded-2xl py-3.5 text-[#B5541F] font-bold text-[14px]">
            Se déconnecter
          </button>
          <button
            onClick={async () => {
              if (!confirm("Supprimer définitivement ton profil et toutes tes données (annonces, messages, avis) ? Cette action est irréversible.")) return;
              await supprimerCompte();
            }}
            className="w-full bg-transparent text-[#8A9A91] font-semibold text-[12px] py-2"
          >
            Supprimer mon compte
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- MES ANNONCES ----------
function EcranMesAnnonces({ onRetour }) {
  const [annonces, setAnnonces] = useState([]);
  const [enEdition, setEnEdition] = useState(null);
  const [titreEdit, setTitreEdit] = useState("");
  const [prixEdit, setPrixEdit] = useState("");
  const [descriptionEdit, setDescriptionEdit] = useState("");

  const charger = () => recupererMesAnnonces().then(({ data }) => setAnnonces(data || []));

  useEffect(() => { charger(); }, []);

  const marquer = async (id) => {
    await marquerVendu(id);
    charger();
  };

  const supprimer = async (id) => {
    if (!confirm("Supprimer définitivement cette annonce ?")) return;
    await supprimerAnnonce(id);
    charger();
  };

  const ouvrirEdition = (a) => {
    setEnEdition(a.id);
    setTitreEdit(a.titre);
    setPrixEdit(a.prix);
    setDescriptionEdit(a.description || "");
  };

  const sauvegarderEdition = async (id) => {
    await modifierAnnonce(id, { titre: titreEdit, prix: prixEdit, description: descriptionEdit });
    setEnEdition(null);
    charger();
  };

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-5 shrink-0 flex items-center gap-3">
        <button onClick={onRetour} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
        </button>
        <h1 className="text-[#FAF6EF] font-bold text-base">Mes annonces</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-3">
        {annonces.length === 0 && <p className="text-center text-[#8A9A91] text-[13px] pt-10">Aucune annonce publiée pour l'instant</p>}
        {annonces.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl p-3 border border-[#EFE9DB]">
            <div className="flex gap-3">
              {a.photos?.[0] ? (
                <img src={a.photos[0]} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[#F0EFE6] flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-[#B0BAB4]" strokeWidth={2} />
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-[#232323] text-[13px]">{a.titre}</p>
                  {a.statut === "vendu" && <CheckCircle2 className="w-3.5 h-3.5 text-[#4FBF8A]" strokeWidth={2.5} />}
                </div>
                <p className="text-[#B5541F] font-extrabold text-[14px]">{a.prix}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-[#5C7268]">{a.nb_vues} vues</span>
                  <span className="text-[11px] text-[#5C7268]">{a.nb_contacts} contacts</span>
                </div>
              </div>
            </div>

            {enEdition === a.id ? (
              <div className="mt-3 pt-3 border-t border-[#F0EFE6] space-y-2">
                <input value={titreEdit} onChange={(e) => setTitreEdit(e.target.value)} className="w-full bg-[#F0EFE6] rounded-lg px-3 py-2 text-[13px] outline-none" placeholder="Titre" />
                <input value={prixEdit} onChange={(e) => setPrixEdit(e.target.value)} className="w-full bg-[#F0EFE6] rounded-lg px-3 py-2 text-[13px] outline-none" placeholder="Prix" />
                <textarea value={descriptionEdit} onChange={(e) => setDescriptionEdit(e.target.value)} rows={2} className="w-full bg-[#F0EFE6] rounded-lg px-3 py-2 text-[13px] outline-none resize-none" placeholder="Description" />
                <div className="flex gap-2">
                  <button onClick={() => sauvegarderEdition(a.id)} className="flex-1 bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[12px] py-2 rounded-lg">Enregistrer</button>
                  <button onClick={() => setEnEdition(null)} className="flex-1 bg-[#F0EFE6] text-[#5C7268] font-bold text-[12px] py-2 rounded-lg">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#F0EFE6]">
                {a.statut === "active" && (
                  <button onClick={() => marquer(a.id)} className="text-[11px] font-bold text-[#B5541F] bg-[#F5E4D5] px-3 py-1.5 rounded-full">
                    Marquer vendu
                  </button>
                )}
                <button onClick={() => ouvrirEdition(a)} className="text-[11px] font-bold text-[#5C7268] bg-[#F0EFE6] px-3 py-1.5 rounded-full">
                  Modifier
                </button>
                <button onClick={() => supprimer(a.id)} className="text-[11px] font-bold text-white bg-[#B5541F] px-3 py-1.5 rounded-full ml-auto">
                  Supprimer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- NAVIGATION BAS ----------
function NavigationBas({ ecranActif, onNaviguer }) {
  const items = [
    { id: "accueil", icon: Home, label: "Accueil" },
    { id: "messagerie", icon: Inbox, label: "Messages" },
    { id: "publier", icon: PlusCircle, label: "Publier" },
    { id: "profil", icon: User, label: "Profil" },
  ];
  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#EFE9DB] px-2 pt-2 pb-6 flex items-center justify-around">
      {items.map((item) => (
        <button key={item.id} onClick={() => onNaviguer(item.id)} className="flex flex-col items-center gap-1 px-3 py-1">
          <item.icon className={`w-[22px] h-[22px] ${ecranActif === item.id ? "text-[#B5541F]" : "text-[#B7C2BB]"}`} strokeWidth={ecranActif === item.id ? 2.5 : 2} />
          <span className={`text-[10px] font-semibold ${ecranActif === item.id ? "text-[#B5541F]" : "text-[#B7C2BB]"}`}>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
