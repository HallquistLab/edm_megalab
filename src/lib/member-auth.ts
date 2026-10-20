import { supabase } from "./supabase";

export async function requestEmorySignIn(email: string, redirectUrl: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@emory\.edu$/.test(normalized)) {
    throw new Error("Please use an @emory.edu email address.");
  }
  if (!supabase) throw new Error("Email sign-in is not available in demo mode.");
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { emailRedirectTo: redirectUrl },
  });
  if (error) throw error;
}
