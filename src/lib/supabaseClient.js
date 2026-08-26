// ============================================
// DJEMA — Connexion à Supabase
// Ce fichier connecte l'application à ta base de données réelle.
// ============================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ggmugoebrjyxxiothngd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnbXVnb2Vicmp5eHhpb3RobmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDk1NDQsImV4cCI6MjEwMzEyNTU0NH0.LMhtEOR_aUZvJk2jAyg5gwHbTvo5rbaeRZaP7YTliB8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
