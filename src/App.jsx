import React, { useState, useEffect } from "react";
import { Search, SlidersHorizontal, Heart, MessageCircle, MapPin, Home, PlusCircle, User, Inbox, ArrowLeft, Phone, Mail, ArrowRight, Star, ShieldCheck, Eye, Send } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import {
  inscriptionParEmail, connexionParEmail, deconnexion, utilisateurActuel,
  recupererAnnonces, recupererAnnonce, publierAnnonce, recupererMesAnnonces,
  enregistrerVue, demarrerConversation, recupererConversations, envoyerMessage,
  recupererMessages, ecouterNouveauxMessages, recupererCategories,
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
          <EcranProfil utilisateur={utilisateur} onDeconnexion={async () => { await deconnexion(); }} />
        )}
        {ecran === "mesAnnonces" && <EcranMesAnnonces onRetour={() => setEcran("accueil")} />}

        {["accueil", "messagerie", "profil"].includes(ecran) && (
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
  const [categorieActive, setCategorieActive] = useState("Tout");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    recupererAnnonces().then(({ data, error }) => {
      if (!error) setAnnonces(data || []);
      setChargement(false);
    });
  }, []);

  const filtrees = categorieActive === "Tout" ? annonces : annonces.filter((a) => a.categorie_nom === categorieActive);

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-[#254539] rounded-full px-4 py-2.5">
            <Search className="w-4 h-4 text-[#9BB0A5]" strokeWidth={2.5} />
            <input placeholder="Chercher un produit, un service..." className="bg-transparent text-sm text-[#FAF6EF] placeholder:text-[#7A9186] outline-none flex-1 min-w-0" />
          </div>
          <button className="w-10 h-10 rounded-full bg-[#B5541F] flex items-center justify-center shrink-0 active:scale-95 transition-transform">
            <SlidersHorizontal className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
          </button>
        </div>
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
          <p className="text-center text-[#8A9A91] text-[13px] pt-10">Aucune annonce pour l'instant — sois le premier à publier !</p>
        )}
        {filtrees.map((a) => (
          <article key={a.id} onClick={() => onOuvrirAnnonce(a)} className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_16px_rgba(27,59,47,0.08)] border border-[#EFE9DB] cursor-pointer">
            <div className="relative">
              <img src={a.photos?.[0] || "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"} alt={a.titre} className="w-full h-52 object-cover" />
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
        <img src={annonce.photos?.[0] || "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"} alt={annonce.titre} className="w-full h-full object-cover" />
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
function EcranPublier({ utilisateur, onPublie, onRetour }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [prix, setPrix] = useState("");
  const [quartier, setQuartier] = useState("");
  const [categorieId, setCategorieId] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    recupererCategories().then(({ data }) => setCategories(data || []));
  }, []);

  const publier = async () => {
    if (!titre || !prix || !quartier) return;
    await publierAnnonce({ titre, description, prix, quartier, categorie_id: categorieId, statut: "active" });
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
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {categories.filter((c) => !c.categorie_parent_id).map((c) => (
            <button key={c.id} onClick={() => setCategorieId(c.id)} className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold ${categorieId === c.id ? "bg-[#B5541F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"}`}>
              {c.nom}
            </button>
          ))}
        </div>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre de l'annonce" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Description" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none resize-none" />
        <input value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="Prix" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />
        <input value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Quartier / Commune" className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#EFE9DB] px-5 pt-3 pb-6">
        <button onClick={publier} className="w-full bg-[#B5541F] text-[#FAF6EF] font-bold text-[15px] py-3.5 rounded-full">
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

  if (conversationOuverte) {
    return (
      <>
        <header className="bg-[#1B3B2F] px-4 pt-10 pb-4 shrink-0 flex items-center gap-3">
          <button onClick={() => onOuvrirConversation(null)} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
          </button>
          <p className="text-[#FAF6EF] font-bold text-[14px]">{conversationOuverte.annonces?.titre || "Conversation"}</p>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.expediteur_id === conversationOuverte.acheteur_id ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[75%] px-4 py-2.5 rounded-2xl bg-white border border-[#EFE9DB]">
                <p className="text-[14px] text-[#232323]">{m.contenu}</p>
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
          <button key={c.id} onClick={() => onOuvrirConversation(c)} className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl text-left">
            <div className="w-14 h-14 rounded-2xl bg-[#E8A93E] flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-[#1B3B2F]">{(c.annonces?.titre || "?").charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#232323] text-[14px] truncate">{c.annonces?.titre}</p>
              <p className="text-[12px] text-[#8A9A91] truncate">{c.annonces?.prix}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- PROFIL ----------
function EcranProfil({ utilisateur, onDeconnexion }) {
  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-[#E8A93E] flex items-center justify-center shrink-0 border-4 border-[#254539]">
            <span className="text-2xl font-black text-[#1B3B2F]">{(utilisateur.email || "U").charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-[#FAF6EF] font-black text-lg">{utilisateur.email}</h1>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <button onClick={onDeconnexion} className="w-full bg-white border border-[#EFE9DB] rounded-2xl py-3.5 text-[#B5541F] font-bold text-[14px]">
          Se déconnecter
        </button>
      </div>
    </>
  );
}

// ---------- MES ANNONCES ----------
function EcranMesAnnonces({ onRetour }) {
  const [annonces, setAnnonces] = useState([]);

  useEffect(() => {
    recupererMesAnnonces().then(({ data }) => setAnnonces(data || []));
  }, []);

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-5 shrink-0 flex items-center gap-3">
        <button onClick={onRetour} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
        </button>
        <h1 className="text-[#FAF6EF] font-bold text-base">Mes annonces</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24 space-y-3">
        {annonces.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl p-3 border border-[#EFE9DB] flex gap-3">
            <div className="flex-1">
              <p className="font-bold text-[#232323] text-[13px]">{a.titre}</p>
              <p className="text-[#B5541F] font-extrabold text-[14px]">{a.prix}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[11px] text-[#5C7268]">{a.nb_vues} vues</span>
                <span className="text-[11px] text-[#5C7268]">{a.nb_contacts} contacts</span>
              </div>
            </div>
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
