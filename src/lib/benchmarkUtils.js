// ============================================
// Calcul du WER (Word Error Rate) et CER (Character Error Rate)
// Compare une transcription à une "vérité terrain" (ce qui a réellement été dit)
// via la distance de Levenshtein — standard pour évaluer la reconnaissance vocale.
// ============================================

function distanceLevenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
    }
  }
  return d[m][n];
}

function normaliser(texte) {
  return (texte || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlève les accents
    .replace(/[^\w\s]/g, "") // enlève la ponctuation
    .trim()
    .replace(/\s+/g, " ");
}

export function calculerWER(verite, hypothese) {
  const mVerite = normaliser(verite).split(" ").filter(Boolean);
  const mHypothese = normaliser(hypothese).split(" ").filter(Boolean);
  if (mVerite.length === 0) return null;
  const distance = distanceLevenshtein(mVerite, mHypothese);
  return Math.round((distance / mVerite.length) * 1000) / 1000;
}

export function calculerCER(verite, hypothese) {
  const cVerite = normaliser(verite).replace(/\s/g, "");
  const cHypothese = normaliser(hypothese).replace(/\s/g, "");
  if (cVerite.length === 0) return null;
  const distance = distanceLevenshtein(cVerite, cHypothese);
  return Math.round((distance / cVerite.length) * 1000) / 1000;
}
