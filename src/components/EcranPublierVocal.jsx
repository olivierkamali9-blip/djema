import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Mic, Square, Loader2, CheckCircle2, AlertCircle, RotateCcw, Camera, X } from "lucide-react";
import { publierAnnonce, recupererCategories, envoyerPhoto } from "../lib/djemaApi";

// ============================================
// DJEMA VOICE — Publier une annonce par la voix
// Pipeline : Enregistrement → Transcription (3 modèles) → Extraction (Claude) → Confirmation → Publication
// Construit pour le Sahara CodeSwitch Africa Challenge 2026
// ============================================

const ETATS = ["Neuf", "Très bon état", "Usé", "Très abîmé"];

// Convertit un Blob audio en base64 (sans le préfixe data:...)
function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onloadend = () => resolve(lecteur.result.split(",")[1]);
    lecteur.onerror = reject;
    lecteur.readAsDataURL(blob);
  });
}

// Petit input avec un bouton micro à côté, pour compléter rapidement
// un champ manquant sans avoir à réenregistrer toute la phrase.
function ChampAvecMicro({ valeur, onChange, placeholder, className, extraireChiffre }) {
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const toggle = async () => {
    if (enregistre) {
      recorderRef.current?.stop();
      setEnregistre(false);
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(flux, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        flux.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setEnCours(true);
        try {
          const audioBase64 = await blobEnBase64(blob);
          const rep = await fetch("/api/transcribe-rapide", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64, mimeType: "audio/webm" }),
          });
          const data = await rep.json();
          if (data.texte) {
            const val = extraireChiffre ? (data.texte.match(/\d+/)?.[0] || data.texte) : data.texte;
            onChange(val.trim());
          }
        } catch (e) {
          // silencieux : l'utilisateur peut toujours taper manuellement
        }
        setEnCours(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setEnregistre(true);
    } catch (e) {
      // micro refusé/indisponible : l'utilisateur tape manuellement
    }
  };

  return (
    <div className="flex-1 relative">
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        onClick={toggle}
        className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center ${
          enregistre ? "bg-[#B5541F]" : "bg-[#EFE9DB]"
        }`}
      >
        {enCours ? (
          <Loader2 className="w-3.5 h-3.5 text-[#5C7268] animate-spin" />
        ) : (
          <Mic className={`w-3.5 h-3.5 ${enregistre ? "text-white" : "text-[#5C7268]"}`} strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}

export default function EcranPublierVocal({ utilisateur, onPublie, onRetour }) {
  const [etape, setEtape] = useState("enregistrer"); // enregistrer | transcription | extraction | verification | publication_ok | erreur
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [dureeSecondes, setDureeSecondes] = useState(0);
  const [audioURL, setAudioURL] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [champs, setChamps] = useState(null);
  const [categories, setCategories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [envoiPhotoEnCours, setEnvoiPhotoEnCours] = useState(false);
  const [messageErreur, setMessageErreur] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const audioBlobRef = useRef(null);

  useEffect(() => {
    recupererCategories().then(({ data }) => setCategories(data || []));
  }, []);

  // ---------- Enregistrement ----------
  const demarrerEnregistrement = async () => {
    setMessageErreur("");
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(flux, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        audioBlobRef.current = blob;
        setAudioURL(URL.createObjectURL(blob));
        flux.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setEnregistrementEnCours(true);
      setDureeSecondes(0);
      intervalRef.current = setInterval(() => setDureeSecondes((d) => d + 1), 1000);
    } catch (e) {
      setMessageErreur("Impossible d'accéder au micro. Vérifie les autorisations de ton navigateur.");
    }
  };

  const arreterEnregistrement = () => {
    mediaRecorderRef.current?.stop();
    setEnregistrementEnCours(false);
    clearInterval(intervalRef.current);
  };

  const recommencer = () => {
    setAudioURL(null);
    audioBlobRef.current = null;
    setDureeSecondes(0);
    setEtape("enregistrer");
    setMessageErreur("");
    setBenchmark(null);
    setChamps(null);
  };

  // ---------- Pipeline : transcription + extraction ----------
  const lancerAnalyse = async () => {
    if (!audioBlobRef.current) return;
    setEtape("transcription");
    setMessageErreur("");
    try {
      const audioBase64 = await blobEnBase64(audioBlobRef.current);

      const repTranscription = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType: "audio/webm" }),
      });
      const dataTranscription = await repTranscription.json();
      if (!repTranscription.ok) throw new Error(dataTranscription.error || "Erreur de transcription");

      setBenchmark(dataTranscription.resultats);

      if (!dataTranscription.texte_principal) {
        throw new Error("Aucun modèle n'a réussi à transcrire l'audio. Réessaie dans un endroit plus calme.");
      }

      setEtape("extraction");
      const repExtraction = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptions: dataTranscription.resultats }),
      });
      const dataExtraction = await repExtraction.json();
      if (!repExtraction.ok) throw new Error(dataExtraction.error || "Erreur d'extraction");

      setChamps({ ...dataExtraction.extrait, texte_transcrit: dataExtraction.extrait.transcription_reconciliee });
      setEtape("verification");
    } catch (e) {
      setMessageErreur(e.message);
      setEtape("erreur");
    }
  };

  // ---------- Publication finale ----------
  const publier = async () => {
    if (!champs) return;
    setEnvoiEnCours(true);
    setMessageErreur("");

    const categorieTrouvee = categories.find((c) => c.nom === champs.categorie && !c.categorie_parent_id);
    if (!categorieTrouvee) {
      setMessageErreur("Catégorie introuvable, corrige-la avant de publier.");
      setEnvoiEnCours(false);
      return;
    }

    const { error } = await publierAnnonce({
      titre: champs.titre,
      description: champs.description,
      prix: champs.prix,
      quartier: champs.quartier,
      categorie_id: categorieTrouvee.id,
      sous_categorie_id: null,
      etat_produit: champs.categorie === "Vente" ? champs.etat_produit || null : null,
      photos,
      statut: "active",
    });

    setEnvoiEnCours(false);
    if (error) {
      setMessageErreur(error.message || "Erreur lors de la publication");
      return;
    }
    setEtape("publication_ok");
  };

  const modifierChamp = (nom, valeur) => setChamps((prev) => ({ ...prev, [nom]: valeur }));

  const choisirPhotos = async (e) => {
    const fichiers = Array.from(e.target.files).slice(0, 5 - photos.length);
    setEnvoiPhotoEnCours(true);
    for (const fichier of fichiers) {
      const { url, error } = await envoyerPhoto(fichier, "annonces");
      if (!error) setPhotos((prev) => [...prev, url]);
    }
    setEnvoiPhotoEnCours(false);
  };

  const retirerPhoto = (index) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const formatDuree = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <header className="bg-[#1B3B2F] px-5 pt-10 pb-4 shrink-0 flex items-center gap-3">
        <button onClick={onRetour} className="w-9 h-9 rounded-full bg-[#254539] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-[#FAF6EF]" strokeWidth={2.5} />
        </button>
        <h1 className="text-[#FAF6EF] font-bold text-base">Publier avec la voix</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28 space-y-6">
        {/* ÉTAPE 1 : Enregistrement */}
        {etape === "enregistrer" && (
          <div className="flex flex-col items-center gap-6 pt-8">
            <p className="text-center text-[14px] text-[#5C7268] px-4">
              Parle naturellement, comme tu le ferais avec un ami. Décris ce que tu veux vendre, chercher, ou proposer.
            </p>

            {!audioURL ? (
              <>
                <button
                  onClick={enregistrementEnCours ? arreterEnregistrement : demarrerEnregistrement}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors ${
                    enregistrementEnCours ? "bg-[#B5541F]" : "bg-[#1B3B2F]"
                  }`}
                >
                  {enregistrementEnCours ? (
                    <Square className="w-8 h-8 text-white" fill="white" />
                  ) : (
                    <Mic className="w-9 h-9 text-white" strokeWidth={2} />
                  )}
                </button>
                <span className="text-[13px] font-semibold text-[#5C7268]">
                  {enregistrementEnCours ? formatDuree(dureeSecondes) : "Appuie pour parler"}
                </span>
              </>
            ) : (
              <div className="w-full flex flex-col items-center gap-4">
                <audio src={audioURL} controls className="w-full" />
                <div className="flex gap-3 w-full">
                  <button
                    onClick={recommencer}
                    className="flex-1 py-3 rounded-xl border border-[#EFE9DB] text-[#5C7268] font-bold text-[13px] flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Recommencer
                  </button>
                  <button
                    onClick={lancerAnalyse}
                    className="flex-1 py-3 rounded-xl bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[13px]"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            )}

            {messageErreur && (
              <p className="text-[13px] text-[#B5541F] text-center flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" /> {messageErreur}
              </p>
            )}
          </div>
        )}

        {/* ÉTAPE 2/3 : Transcription + extraction en cours */}
        {(etape === "transcription" || etape === "extraction") && (
          <div className="flex flex-col items-center gap-4 pt-16">
            <Loader2 className="w-8 h-8 text-[#1B3B2F] animate-spin" />
            <p className="text-[14px] font-semibold text-[#1B3B2F]">
              {etape === "transcription" ? "Écoute en cours..." : "Je structure ton annonce..."}
            </p>
          </div>
        )}

        {/* ÉTAPE 4 : Vérification / correction */}
        {etape === "verification" && champs && (
          <div className="space-y-4">
            <div className="bg-[#F5F1E6] rounded-xl p-3">
              <p className="text-[11px] font-bold text-[#8A9A91] uppercase tracking-wide mb-1">Ce que j'ai compris</p>
              <p className="text-[13px] text-[#5C7268] italic">"{champs.texte_transcrit}"</p>
            </div>

            {champs.champs_manquants?.length > 0 && (
              <p className="text-[12px] text-[#B5541F] flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Complète : {champs.champs_manquants.join(", ")}
              </p>
            )}

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
                  <span className="text-[10px] font-semibold text-[#8A9A91]">{envoiPhotoEnCours ? "Envoi..." : "Ajouter"}</span>
                </label>
              )}
            </div>

            <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide block">Catégorie</label>
            <div className="flex gap-2 flex-wrap">
              {["Vente", "Recherche", "Emploi", "Service"].map((c) => (
                <button
                  key={c}
                  onClick={() => modifierChamp("categorie", c)}
                  className={`px-3.5 py-2 rounded-full text-[12px] font-bold ${
                    champs.categorie === c ? "bg-[#B5541F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <input
              value={champs.titre || ""}
              onChange={(e) => modifierChamp("titre", e.target.value)}
              placeholder="Titre"
              className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none"
            />
            <textarea
              value={champs.description || ""}
              onChange={(e) => modifierChamp("description", e.target.value)}
              rows={3}
              placeholder="Description"
              className="w-full bg-white border border-[#EFE9DB] rounded-xl px-4 py-3 text-[14px] outline-none resize-none"
            />
            <div className="flex gap-3">
              <ChampAvecMicro
                valeur={champs.prix || ""}
                onChange={(v) => modifierChamp("prix", v)}
                placeholder={champs.categorie === "Emploi" ? "Salaire" : "Prix"}
                className="w-full bg-white border border-[#EFE9DB] rounded-xl pl-4 pr-10 py-3 text-[14px] outline-none"
                extraireChiffre
              />
              <ChampAvecMicro
                valeur={champs.quartier || ""}
                onChange={(v) => modifierChamp("quartier", v)}
                placeholder="Quartier"
                className="w-full bg-white border border-[#EFE9DB] rounded-xl pl-4 pr-10 py-3 text-[14px] outline-none"
              />
            </div>

            {champs.categorie === "Vente" && (
              <>
                <label className="text-[12px] font-bold text-[#5C7268] uppercase tracking-wide block">État</label>
                <div className="flex gap-2 flex-wrap">
                  {ETATS.map((e) => (
                    <button
                      key={e}
                      onClick={() => modifierChamp("etat_produit", e)}
                      className={`px-3.5 py-2 rounded-full text-[12px] font-bold ${
                        champs.etat_produit === e ? "bg-[#1B3B2F] text-[#FAF6EF]" : "bg-white border border-[#EFE9DB] text-[#5C7268]"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messageErreur && (
              <p className="text-[13px] text-[#B5541F] text-center flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" /> {messageErreur}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={recommencer}
                className="flex-1 py-3 rounded-xl border border-[#EFE9DB] text-[#5C7268] font-bold text-[13px]"
              >
                Recommencer
              </button>
              <button
                onClick={publier}
                disabled={envoiEnCours}
                className="flex-1 py-3 rounded-xl bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[13px] disabled:opacity-50"
              >
                {envoiEnCours ? "Publication..." : "Publier"}
              </button>
            </div>

            {/* Benchmark discret pour usage interne / dossier de candidature */}
            {benchmark && (
              <details className="text-[11px] text-[#8A9A91] pt-2">
                <summary className="cursor-pointer font-semibold">Détails techniques (benchmark modèles)</summary>
                <div className="mt-2 space-y-1">
                  {benchmark.map((r) => (
                    <div key={r.modele}>
                      <b>{r.modele}</b> — {r.erreur ? `erreur: ${r.erreur}` : `${r.duree_ms}ms — "${r.texte}"`}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ÉTAPE 5 : Succès */}
        {etape === "publication_ok" && (
          <div className="flex flex-col items-center gap-4 pt-16">
            <CheckCircle2 className="w-14 h-14 text-[#1B3B2F]" />
            <p className="text-[15px] font-bold text-[#1B3B2F]">Annonce publiée !</p>
            <button onClick={onPublie} className="px-6 py-3 rounded-xl bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[13px]">
              Voir mes annonces
            </button>
          </div>
        )}

        {/* Erreur bloquante */}
        {etape === "erreur" && (
          <div className="flex flex-col items-center gap-4 pt-16">
            <AlertCircle className="w-12 h-12 text-[#B5541F]" />
            <p className="text-[14px] text-center text-[#5C7268] px-4">{messageErreur}</p>
            <button onClick={recommencer} className="px-6 py-3 rounded-xl bg-[#1B3B2F] text-[#FAF6EF] font-bold text-[13px]">
              Réessayer
            </button>
            {benchmark && (
              <details open className="text-[11px] text-[#8A9A91] pt-2 w-full">
                <summary className="cursor-pointer font-semibold">Détails techniques (pourquoi ça a échoué)</summary>
                <div className="mt-2 space-y-1">
                  {benchmark.map((r) => (
                    <div key={r.modele}>
                      <b>{r.modele}</b> — {r.erreur ? `erreur: ${r.erreur}` : `${r.duree_ms}ms — "${r.texte}"`}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </>
  );
}
