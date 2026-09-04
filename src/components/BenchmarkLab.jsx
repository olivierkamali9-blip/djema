import React, { useState, useRef } from "react";
import { Mic, Square, Trash2, Play, Loader2, Download, Plus } from "lucide-react";
import { calculerWER, calculerCER } from "../lib/benchmarkUtils";

// ============================================
// DJEMA VOICE — Laboratoire de Benchmark (outil interne)
// Accessible sur /benchmark — pas lié dans la navigation principale.
// Permet d'enregistrer plusieurs échantillons avec leur "vérité terrain"
// (ce qui a réellement été dit), de les passer automatiquement dans les
// 3 modèles (Sahara, Whisper, Gemini), et de calculer WER/CER pour
// alimenter le rapport de benchmark du Sahara CodeSwitch Challenge.
// ============================================

const LANGUES = [
  "Français",
  "Lingala",
  "Swahili",
  "Mélange FR/Lingala",
  "Mélange FR/Swahili",
  "Mélange Lingala/Swahili",
  "Mélange FR/Lingala/Swahili",
];

function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onloadend = () => resolve(lecteur.result.split(",")[1]);
    lecteur.onerror = reject;
    lecteur.readAsDataURL(blob);
  });
}

function EnregistreurEchantillon({ onAjouter }) {
  const [enregistre, setEnregistre] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioURL, setAudioURL] = useState(null);
  const [verite, setVerite] = useState("");
  const [langue, setLangue] = useState(LANGUES[6]);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const toggle = async () => {
    if (enregistre) {
      recorderRef.current?.stop();
      setEnregistre(false);
      return;
    }
    const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(flux, { mimeType: "audio/webm" });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      flux.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setAudioBlob(blob);
      setAudioURL(URL.createObjectURL(blob));
    };
    recorder.start();
    recorderRef.current = recorder;
    setEnregistre(true);
  };

  const ajouter = () => {
    if (!audioBlob || !verite.trim()) return;
    onAjouter({ id: Date.now(), audioBlob, audioURL, verite: verite.trim(), langue, resultats: null });
    setAudioBlob(null);
    setAudioURL(null);
    setVerite("");
  };

  return (
    <div className="bg-white rounded-2xl border border-[#EFE9DB] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${enregistre ? "bg-[#B5541F]" : "bg-[#1B3B2F]"}`}
        >
          {enregistre ? <Square className="w-5 h-5 text-white" fill="white" /> : <Mic className="w-5 h-5 text-white" />}
        </button>
        {audioURL ? (
          <audio src={audioURL} controls className="flex-1 h-10" />
        ) : (
          <span className="text-[13px] text-[#8A9A91]">{enregistre ? "Enregistrement..." : "Appuie pour enregistrer un échantillon"}</span>
        )}
      </div>
      <textarea
        value={verite}
        onChange={(e) => setVerite(e.target.value)}
        placeholder="Vérité terrain — écris exactement ce que tu as dit dans l'audio"
        rows={2}
        className="w-full bg-[#FAF6EF] border border-[#EFE9DB] rounded-xl px-3 py-2 text-[13px] outline-none resize-none"
      />
      <select value={langue} onChange={(e) => setLangue(e.target.value)} className="w-full bg-[#FAF6EF] border border-[#EFE9DB] rounded-xl px-3 py-2 text-[13px] outline-none">
        {LANGUES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <button
        onClick={ajouter}
        disabled={!audioBlob || !verite.trim()}
        className="w-full py-2.5 rounded-xl bg-[#1B3B2F] text-white font-bold text-[13px] disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Ajouter à la liste
      </button>
    </div>
  );
}

export default function BenchmarkLab() {
  const [echantillons, setEchantillons] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(0);

  const supprimer = (id) => setEchantillons((prev) => prev.filter((e) => e.id !== id));

  const lancerBenchmark = async () => {
    setEnCours(true);
    setProgression(0);
    const resultatsMaj = [];

    for (let i = 0; i < echantillons.length; i++) {
      const ech = echantillons[i];
      try {
        const audioBase64 = await blobEnBase64(ech.audioBlob);
        const rep = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64, mimeType: "audio/webm" }),
        });
        const data = await rep.json();
        const resultats = (data.resultats || []).map((r) => ({
          ...r,
          wer: r.texte ? calculerWER(ech.verite, r.texte) : null,
          cer: r.texte ? calculerCER(ech.verite, r.texte) : null,
        }));
        resultatsMaj.push({ id: ech.id, resultats });
      } catch (e) {
        resultatsMaj.push({ id: ech.id, resultats: [{ modele: "erreur", erreur: e.message }] });
      }
      setProgression(i + 1);
    }

    setEchantillons((prev) =>
      prev.map((e) => {
        const maj = resultatsMaj.find((r) => r.id === e.id);
        return maj ? { ...e, resultats: maj.resultats } : e;
      })
    );
    setEnCours(false);
  };

  const modeles = ["sahara", "whisper", "gemini"];
  const agregats = modeles.map((m) => {
    const donnees = echantillons
      .flatMap((e) => e.resultats || [])
      .filter((r) => r.modele === m && r.wer !== null && r.wer !== undefined);
    const moyenne = (cle) => (donnees.length ? donnees.reduce((s, r) => s + (r[cle] || 0), 0) / donnees.length : null);
    return {
      modele: m,
      nbEchantillons: donnees.length,
      werMoyen: moyenne("wer"),
      cerMoyen: moyenne("cer"),
      dureeMoyenne: moyenne("duree_ms"),
    };
  });

  const exporterCSV = () => {
    const lignes = [["echantillon", "langue", "verite", "modele", "transcription", "wer", "cer", "duree_ms", "erreur"]];
    echantillons.forEach((e, i) => {
      (e.resultats || []).forEach((r) => {
        lignes.push([
          `echantillon_${i + 1}`,
          e.langue,
          e.verite,
          r.modele,
          (r.texte || "").replace(/"/g, "'"),
          r.wer ?? "",
          r.cer ?? "",
          r.duree_ms ?? "",
          (r.erreur || "").replace(/"/g, "'"),
        ]);
      });
    });
    const csv = lignes.map((l) => l.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "djema_voice_benchmark.csv";
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#FAF6EF] px-5 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-[#1B3B2F] mb-1">🧪 Djema Voice — Laboratoire de Benchmark</h1>
      <p className="text-[13px] text-[#5C7268] mb-6">
        Outil interne (non public). Enregistre plusieurs échantillons avec leur vérité terrain, lance le benchmark, exporte les résultats pour le rapport.
      </p>

      <EnregistreurEchantillon onAjouter={(e) => setEchantillons((prev) => [...prev, e])} />

      {echantillons.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-[14px] font-bold text-[#1B3B2F]">Échantillons ({echantillons.length})</h2>
          {echantillons.map((e, i) => (
            <div key={e.id} className="bg-white rounded-xl border border-[#EFE9DB] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-[#1B3B2F]">#{i + 1} — {e.langue}</p>
                  <p className="text-[12px] text-[#5C7268] italic truncate">"{e.verite}"</p>
                </div>
                <button onClick={() => supprimer(e.id)} className="shrink-0 text-[#B5541F]">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {e.resultats && (
                <div className="mt-2 pt-2 border-t border-[#F0EFE6] space-y-1">
                  {e.resultats.map((r) => (
                    <p key={r.modele} className="text-[11px] text-[#5C7268]">
                      <b>{r.modele}</b> — {r.erreur ? `erreur: ${r.erreur}` : `WER: ${r.wer ?? "?"} · CER: ${r.cer ?? "?"} · ${r.duree_ms}ms`}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={lancerBenchmark}
            disabled={enCours}
            className="w-full py-3 rounded-xl bg-[#B5541F] text-white font-bold text-[13px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {enCours ? `Test en cours (${progression}/${echantillons.length})...` : "Lancer le benchmark"}
          </button>
        </div>
      )}

      {agregats.some((a) => a.nbEchantillons > 0) && (
        <div className="mt-8">
          <h2 className="text-[14px] font-bold text-[#1B3B2F] mb-3">📊 Résumé par modèle</h2>
          <table className="w-full text-[12px] bg-white rounded-xl overflow-hidden border border-[#EFE9DB]">
            <thead className="bg-[#1B3B2F] text-white">
              <tr>
                <th className="p-2 text-left">Modèle</th>
                <th className="p-2 text-right">N</th>
                <th className="p-2 text-right">WER moyen</th>
                <th className="p-2 text-right">CER moyen</th>
                <th className="p-2 text-right">Latence moy.</th>
              </tr>
            </thead>
            <tbody>
              {agregats.map((a) => (
                <tr key={a.modele} className="border-t border-[#F0EFE6]">
                  <td className="p-2 font-bold">{a.modele}</td>
                  <td className="p-2 text-right">{a.nbEchantillons}</td>
                  <td className="p-2 text-right">{a.werMoyen !== null ? a.werMoyen.toFixed(3) : "—"}</td>
                  <td className="p-2 text-right">{a.cerMoyen !== null ? a.cerMoyen.toFixed(3) : "—"}</td>
                  <td className="p-2 text-right">{a.dureeMoyenne !== null ? `${Math.round(a.dureeMoyenne)}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={exporterCSV} className="mt-4 w-full py-3 rounded-xl border-2 border-[#1B3B2F] text-[#1B3B2F] font-bold text-[13px] flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Exporter en CSV
          </button>
        </div>
      )}
    </div>
  );
}
