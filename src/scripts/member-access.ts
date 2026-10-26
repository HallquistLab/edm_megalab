import { supabase } from "../lib/supabase";

const panel = document.querySelector<HTMLDetailsElement>("[data-member-panel]");
const summary = panel?.querySelector<HTMLElement>("summary");

function closePanel(returnFocus = false) {
  if (!panel?.open) return;
  panel.open = false;
  if (returnFocus) summary?.focus({ preventScroll: true });
}

document.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Node && !panel?.contains(event.target)) closePanel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panel?.open) {
    event.preventDefault();
    closePanel(true);
  }
});
supabase?.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT")
    closePanel(Boolean(panel?.contains(document.activeElement)));
});
