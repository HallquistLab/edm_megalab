import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { formatSessionDate } from "../lib/dates";

type ActivePoll = {
  title: string;
  meeting_slot: string;
  closes_at: string;
  max_approvals: number;
};

const banner = document.querySelector<HTMLElement>("[data-home-poll]");
const pollName = document.querySelector<HTMLElement>("[data-home-poll-name]");
const pollMeta = document.querySelector<HTMLElement>("[data-home-poll-meta]");

function friendlyDeadline(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function showActivePoll() {
  if (!isSupabaseConfigured || !supabase || !banner) return;

  const { data, error } = await supabase
    .from("polls")
    .select("title,meeting_slot,closes_at,max_approvals")
    .eq("status", "open")
    .gt("closes_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return;

  const poll = data as ActivePoll;
  if (pollName) pollName.textContent = poll.title;
  if (pollMeta) {
    pollMeta.textContent = `Session date: ${formatSessionDate(poll.meeting_slot)} · Choose up to ${poll.max_approvals} · Closes ${friendlyDeadline(poll.closes_at)}`;
  }
  banner.hidden = false;
}

void showActivePoll();
