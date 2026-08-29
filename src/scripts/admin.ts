import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

type Suggestion = {
  id: string;
  title: string;
  url: string;
  citation: string;
  topic: string;
  rationale: string;
  questions: string;
  submitter_name: string;
  status: "pending" | "queued" | "selected" | "archived";
  created_at: string;
};

type Poll = {
  id: string;
  title: string;
  meeting_slot: string;
  closes_at: string;
  status: "draft" | "open" | "closed";
  max_approvals: number;
};

const select = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector);
const authForm = select<HTMLFormElement>("[data-admin-auth-form]");
const authStatus = select<HTMLElement>("[data-admin-auth-status]");
const signedIn = select<HTMLElement>("[data-admin-signed-in]");
const adminEmail = select<HTMLElement>("[data-admin-email]");
const workspace = select<HTMLElement>("[data-admin-workspace]");
const demo = select<HTMLElement>("[data-admin-demo]");
const moderationList = select<HTMLElement>("[data-moderation-list]");
const pollChoices = select<HTMLElement>("[data-poll-choices]");
const pollRegister = select<HTMLElement>("[data-poll-register]");
const pollForm = select<HTMLFormElement>("[data-poll-form]");
const pollStatus = select<HTMLElement>("[data-poll-status]");
let user: User | null = null;
let suggestions: Suggestion[] = [];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
}

function setText(selector: string, text: string) {
  const element = select<HTMLElement>(selector);
  if (element) element.textContent = text;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function setSuggestionStatus(id: string, status: Suggestion["status"]) {
  if (!supabase) return;
  const { error } = await supabase
    .from("article_suggestions")
    .update({ status })
    .eq("id", id);
  if (error) {
    if (authStatus) authStatus.textContent = error.message;
    return;
  }
  await loadWorkspace();
}

function moderationCard(article: Suggestion) {
  const card = node("article", "moderation-card");
  const body = node("div");
  body.append(
    node("span", "collection collection-priority", article.topic),
    node("h3", "", article.title),
    node(
      "p",
      "moderation-meta",
      `${article.citation} · Suggested by ${article.submitter_name}`,
    ),
    node("p", "", article.rationale),
  );
  if (article.questions)
    body.append(node("p", "discussion-prompt", `Questions: ${article.questions}`));
  const articleLink = node("a", "text-link", "Read paper ↗");
  articleLink.href = article.url;
  articleLink.target = "_blank";
  articleLink.rel = "noreferrer";
  body.append(articleLink);

  const actions = node("div", "moderation-actions");
  const queueButton = node("button", "button button-primary", "Add to queue");
  queueButton.type = "button";
  queueButton.addEventListener(
    "click",
    () => void setSuggestionStatus(article.id, "queued"),
  );
  const archiveButton = node("button", "text-button", "Archive");
  archiveButton.type = "button";
  archiveButton.addEventListener(
    "click",
    () => void setSuggestionStatus(article.id, "archived"),
  );
  actions.append(queueButton, archiveButton);
  card.append(body, actions);
  return card;
}

function renderChoices() {
  if (!pollChoices) return;
  const queued = suggestions.filter((article) =>
    ["queued", "selected"].includes(article.status),
  );
  if (!queued.length) {
    pollChoices.replaceChildren(
      node("p", "empty-state", "Queue two or more articles to build a poll."),
    );
    return;
  }
  pollChoices.replaceChildren(
    ...queued.map((article) => {
      const label = node("label", "poll-choice");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "article_ids";
      input.value = article.id;
      const copy = node("span");
      copy.append(node("strong", "", article.title), node("small", "", article.citation));
      label.append(input, copy);
      return label;
    }),
  );
}

function pollRow(poll: Poll) {
  const row = node("article", "poll-row");
  const copy = node("div");
  copy.append(
    node("span", `poll-status poll-status-${poll.status}`, poll.status),
    node("h3", "", poll.title),
    node(
      "p",
      "",
      `${poll.meeting_slot} · closes ${formatDate(poll.closes_at)} · up to ${poll.max_approvals}`,
    ),
  );
  if (poll.status === "open") {
    const action = node("button", "text-button", "Close poll");
    action.type = "button";
    action.addEventListener("click", async () => {
      if (!supabase) return;
      const { error } = await supabase
        .from("polls")
        .update({ status: "closed" })
        .eq("id", poll.id);
      if (error && authStatus) authStatus.textContent = error.message;
      if (!error) await loadWorkspace();
    });
    row.append(copy, action);
  } else {
    row.append(copy, node("span", "poll-closed-note", "Complete"));
  }
  return row;
}

async function loadWorkspace() {
  if (!supabase) return;
  const [
    { data: articleData, error: articleError },
    { data: pollData, error: pollError },
  ] = await Promise.all([
    supabase
      .from("article_suggestions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("polls")
      .select("id,title,meeting_slot,closes_at,status,max_approvals")
      .order("created_at", { ascending: false }),
  ]);
  if (articleError || pollError) throw articleError ?? pollError;
  suggestions = (articleData ?? []) as Suggestion[];
  const polls = (pollData ?? []) as Poll[];
  const pending = suggestions.filter((article) => article.status === "pending");
  setText("[data-pending-count]", String(pending.length));
  setText(
    "[data-queued-count]",
    String(suggestions.filter((article) => article.status === "queued").length),
  );
  setText(
    "[data-open-count]",
    String(polls.filter((poll) => poll.status === "open").length),
  );
  moderationList?.replaceChildren(
    ...(pending.length
      ? pending.map(moderationCard)
      : [node("p", "empty-state", "Nothing is waiting for review.")]),
  );
  renderChoices();
  pollRegister?.replaceChildren(
    ...(polls.length
      ? polls.map(pollRow)
      : [node("p", "empty-state", "No polls have been created yet.")]),
  );
}

async function updateSession(nextUser: User | null) {
  user = nextUser;
  if (authForm) authForm.hidden = Boolean(user);
  if (signedIn) signedIn.hidden = !user;
  if (adminEmail) adminEmail.textContent = user?.email ?? "";
  if (!supabase || !user) {
    if (workspace) workspace.hidden = true;
    return;
  }
  const { data: isAdmin, error } = await supabase.rpc("is_current_user_admin");
  if (error || !isAdmin) {
    if (workspace) workspace.hidden = true;
    if (authStatus)
      authStatus.textContent =
        "This email is signed in but is not on the coordinator list.";
    return;
  }
  if (authStatus) authStatus.textContent = "Coordinator access confirmed.";
  if (workspace) workspace.hidden = false;
  await loadWorkspace();
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    if (authStatus)
      authStatus.textContent = "Demo mode: connect Supabase to enable sign-in.";
    return;
  }
  const email = String(new FormData(authForm).get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.endsWith("@emory.edu")) {
    if (authStatus) authStatus.textContent = "Please use an @emory.edu email address.";
    return;
  }
  if (authStatus) authStatus.textContent = "Sending your secure link…";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("#")[0] },
  });
  if (authStatus)
    authStatus.textContent = error
      ? error.message
      : "Check your email for the sign-in link.";
});

select<HTMLButtonElement>("[data-admin-sign-out]")?.addEventListener(
  "click",
  async () => {
    await supabase?.auth.signOut();
  },
);

pollForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;
  const data = new FormData(pollForm);
  const articleIds = data.getAll("article_ids").map(String);
  if (articleIds.length < 2 || articleIds.length > 8) {
    if (pollStatus) pollStatus.textContent = "Choose between two and eight articles.";
    return;
  }
  if (pollStatus) pollStatus.textContent = "Publishing the ballot…";
  const closesAt = new Date(String(data.get("closes_at"))).toISOString();
  const { error } = await supabase.rpc("create_poll", {
    p_title: String(data.get("title")),
    p_meeting_slot: String(data.get("meeting_slot")),
    p_closes_at: closesAt,
    p_max_approvals: Number(data.get("max_approvals")),
    p_article_ids: articleIds,
  });
  if (pollStatus)
    pollStatus.textContent = error
      ? error.message
      : "Poll published. It is now live on the article queue.";
  if (!error) {
    pollForm.reset();
    await loadWorkspace();
  }
});

async function start() {
  if (!isSupabaseConfigured || !supabase) {
    if (demo) demo.hidden = false;
    return;
  }
  if (demo) demo.hidden = true;
  const { data } = await supabase.auth.getSession();
  try {
    await updateSession(data.session?.user ?? null);
  } catch (error) {
    if (authStatus)
      authStatus.textContent =
        error instanceof Error ? error.message : "Unable to load the console.";
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    void updateSession(session?.user ?? null);
  });
}

void start();
