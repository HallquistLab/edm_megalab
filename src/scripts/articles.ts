import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { formatSessionDate } from "../lib/dates";
import { keywordTone } from "../lib/keywords";
import { showActionFeedback } from "./feedback";
import { isPresentedArticle } from "../lib/article-status";

type Suggestion = {
  id: string;
  title: string;
  url: string;
  citation: string;
  topic: string;
  rationale: string;
  submitter_name: string;
  status: string;
};

type Poll = {
  id: string;
  title: string;
  meeting_slot: string;
  closes_at: string;
  max_approvals: number;
};

type PollOption = {
  article_id: string;
  position: number;
  article_suggestions: Suggestion;
};

const select = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector);

const status = select<HTMLElement>("[data-queue-status]");
const ballotSection = select<HTMLElement>("[data-ballot-section]");
const ballotGrid = select<HTMLElement>("[data-ballot-grid]");
const queueList = select<HTMLElement>("[data-queue-list]");
const ballotNote = select<HTMLElement>("[data-ballot-note]");
const pollEyebrow = select<HTMLElement>("[data-poll-eyebrow]");
const pollTitle = select<HTMLElement>("[data-poll-title]");
const pollLimit = select<HTMLElement>("[data-poll-limit]");
const pollInstructions = select<HTMLElement>("[data-poll-instructions]");
const authForm = select<HTMLFormElement>("[data-auth-form]");
const authStatus = select<HTMLElement>("[data-auth-status]");
const signedInState = select<HTMLElement>("[data-signed-in]");
const memberEmail = select<HTMLElement>("[data-member-email]");
const memberPanel = select<HTMLDetailsElement>("[data-member-panel]");
const memberLabel = select<HTMLElement>("[data-member-label]");
const memberCopy = select<HTMLElement>("[data-member-copy]");
const memberEmailInput = select<HTMLInputElement>("#member-email");
const openProposalButton = select<HTMLButtonElement>("[data-open-proposal]");
const proposalDrawer = select<HTMLElement>("[data-proposal-drawer]");
const proposalForm = select<HTMLFormElement>("[data-proposal-form]");
const proposalStatus = select<HTMLElement>("[data-proposal-status]");

let currentUser: User | null = null;
let currentPoll: Poll | null = null;
let currentOptions: PollOption[] = [];
let currentVotes = new Set<string>();
let tallies = new Map<string, number>();
type SignInAction = "suggest" | "vote";
const returnAction = new URL(window.location.href).searchParams.get("action");
let pendingAction: SignInAction | null =
  returnAction === "suggest" || returnAction === "vote" ? returnAction : null;

function showSignIn(action: SignInAction) {
  pendingAction = action;
  if (memberPanel) {
    memberPanel.open = true;
    memberPanel.scrollIntoView({ block: "center" });
  }
  if (authStatus) {
    authStatus.textContent =
      action === "suggest"
        ? "Sign in with your Emory email to suggest an article."
        : "Sign in with your Emory email to vote.";
  }
  memberEmailInput?.focus({ preventScroll: true });
}

function showProposal() {
  if (!proposalDrawer) return;
  proposalDrawer.hidden = false;
  openProposalButton?.setAttribute("aria-expanded", "true");
  if (memberPanel) memberPanel.open = false;
  proposalDrawer.scrollIntoView({ block: "start" });
  proposalForm?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
}

function closeProposal() {
  if (proposalDrawer) proposalDrawer.hidden = true;
  openProposalButton?.setAttribute("aria-expanded", "false");
}

function resumeAction() {
  if (!currentUser || !pendingAction) return;
  const action = pendingAction;
  pendingAction = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  window.history.replaceState(null, "", url);
  if (memberPanel) memberPanel.open = false;
  if (action === "suggest") {
    showProposal();
  } else if (ballotSection && !ballotSection.hidden) {
    ballotSection.scrollIntoView({ block: "start" });
    ballotGrid
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
}

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function updateAuth(user: User | null) {
  currentUser = user;
  if (authForm) authForm.hidden = Boolean(user);
  if (signedInState) signedInState.hidden = !user;
  if (memberEmail) memberEmail.textContent = user?.email ?? "";
  if (memberLabel) memberLabel.textContent = user ? "Account" : "Sign in";
  if (memberCopy) memberCopy.hidden = Boolean(user);
  if (!user) closeProposal();
}

function queueCard(article: Suggestion, index: number) {
  const card = node("article");
  card.append(node("span", "queue-rank", String(index + 1).padStart(2, "0")));
  const content = node("div");
  content.append(
    node(
      "span",
      `keyword-badge keyword-static ${keywordTone(article.topic)}`,
      article.topic,
    ),
    node("h3", "", article.title),
    node("p", "", `${article.citation} · Suggested by ${article.submitter_name}`),
  );
  const link = node("a", "", "↗");
  link.href = article.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-label", `Read ${article.title}`);
  card.append(content, node("p", "", article.rationale), link);
  return card;
}

function ballotCard(option: PollOption, index: number) {
  const article = option.article_suggestions;
  const approved = currentVotes.has(article.id);
  const card = node("article", `ballot-card${approved ? " is-approved" : ""}`);
  const top = node("div", "ballot-card-top");
  const count = node("span", "vote-count");
  const total = tallies.get(article.id) ?? 0;
  count.append(
    node("strong", "", String(total)),
    document.createTextNode(` vote${total === 1 ? "" : "s"}`),
  );
  top.append(node("span", "", String(index + 1).padStart(2, "0")), count);

  const content = node("div");
  content.append(
    node("p", "", article.topic),
    node("h3", "", article.title),
    node("span", "", article.citation),
  );
  const link = node("a", "", "Read paper ↗");
  link.href = article.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  const vote = node(
    "button",
    "",
    approved ? "Voted ✓" : currentUser ? "Vote for this paper" : "Sign in to vote",
  );
  vote.type = "button";
  vote.setAttribute("aria-pressed", String(approved));
  vote.addEventListener("click", () => {
    if (!currentUser) {
      showSignIn("vote");
      return;
    }
    void toggleVote(article.id, vote);
  });
  card.append(top, content, link, vote);
  return card;
}

function renderBallot() {
  if (!ballotGrid || !currentPoll) return;
  ballotGrid.replaceChildren(
    ...currentOptions.map((option, index) => ballotCard(option, index)),
  );
  if (pollEyebrow) {
    pollEyebrow.textContent = `Session date: ${formatSessionDate(currentPoll.meeting_slot)}`;
  }
  if (pollTitle) pollTitle.textContent = currentPoll.title;
  if (pollLimit) pollLimit.textContent = `Up to ${currentPoll.max_approvals} votes`;
  if (pollInstructions) {
    pollInstructions.textContent = `You may change your votes until ${friendlyDate(currentPoll.closes_at)}.`;
  }
  if (ballotNote) {
    ballotNote.textContent = currentUser
      ? `${currentVotes.size} of ${currentPoll.max_approvals} votes selected · Results update immediately`
      : "Sign in to vote.";
  }
  if (ballotSection) ballotSection.hidden = false;
}

async function loadQueue() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("article_suggestions")
    .select("id,title,url,citation,topic,rationale,submitter_name,status")
    .in("status", ["queued", "selected"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const articles = ((data ?? []) as Suggestion[]).filter(
    (article) => !isPresentedArticle(article),
  );
  if (queueList) {
    queueList.replaceChildren(
      ...(articles.length
        ? articles.map(queueCard)
        : [node("p", "empty-state", "The live queue is ready for its first article.")]),
    );
  }
  if (status) {
    status.innerHTML = "";
    status.append(
      node("strong", "", "Member queue"),
      document.createTextNode(
        ` · ${articles.length} article${articles.length === 1 ? "" : "s"} under consideration`,
      ),
    );
  }
}

async function loadPoll() {
  if (!supabase) return;
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("id,title,meeting_slot,closes_at,max_approvals")
    .eq("status", "open")
    .gt("closes_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pollError) throw pollError;
  if (!poll) {
    currentPoll = null;
    currentOptions = [];
    currentVotes.clear();
    tallies.clear();
    ballotGrid?.replaceChildren();
    if (ballotSection) ballotSection.hidden = true;
    return;
  }
  currentPoll = poll as Poll;
  const { data: options, error: optionError } = await supabase
    .from("poll_options")
    .select(
      "article_id,position,article_suggestions(id,title,url,citation,topic,rationale,submitter_name,status)",
    )
    .eq("poll_id", currentPoll.id)
    .order("position");
  if (optionError) throw optionError;
  currentOptions = ((options ?? []) as unknown as PollOption[]).filter(
    (option) =>
      option.article_suggestions && !isPresentedArticle(option.article_suggestions),
  );

  const { data: results, error: resultError } = await supabase.rpc("get_poll_results", {
    p_poll_id: currentPoll.id,
  });
  if (resultError) throw resultError;
  tallies = new Map(
    (results ?? []).map((result: { article_id: string; approvals: number }) => [
      result.article_id,
      Number(result.approvals),
    ]),
  );

  currentVotes = new Set();
  if (currentUser) {
    const { data: votes, error: voteError } = await supabase
      .from("poll_votes")
      .select("article_id")
      .eq("poll_id", currentPoll.id)
      .eq("voter_id", currentUser.id);
    if (voteError) throw voteError;
    currentVotes = new Set((votes ?? []).map((vote) => vote.article_id as string));
  }
  renderBallot();
}

async function toggleVote(articleId: string, button: HTMLButtonElement) {
  if (!supabase || !currentUser || !currentPoll) return;
  button.disabled = true;
  const approved = currentVotes.has(articleId);
  const query = approved
    ? supabase
        .from("poll_votes")
        .delete()
        .eq("poll_id", currentPoll.id)
        .eq("article_id", articleId)
        .eq("voter_id", currentUser.id)
    : supabase.from("poll_votes").insert({
        poll_id: currentPoll.id,
        article_id: articleId,
        voter_id: currentUser.id,
      });
  const { error } = await query;
  if (error) {
    if (ballotNote) ballotNote.textContent = error.message;
    showActionFeedback("We couldn’t update your vote. Please try again.", "error");
    button.disabled = false;
    return;
  }
  showActionFeedback(approved ? "Your vote was removed." : "Your vote was recorded.");
  await loadPoll();
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    if (authStatus)
      authStatus.textContent = "Demo mode: connect Supabase to enable email sign-in.";
    showActionFeedback("Email sign-in is not available in demo mode.", "info");
    return;
  }
  const formData = new FormData(authForm);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.endsWith("@emory.edu")) {
    if (authStatus) authStatus.textContent = "Please use an @emory.edu email address.";
    showActionFeedback("Please use an @emory.edu email address.", "error");
    return;
  }
  if (authStatus) authStatus.textContent = "Sending your secure link…";
  const redirectUrl = new URL(window.location.href);
  redirectUrl.hash = "";
  redirectUrl.searchParams.delete("action");
  if (pendingAction) redirectUrl.searchParams.set("action", pendingAction);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl.toString() },
  });
  if (authStatus) {
    authStatus.textContent = error
      ? error.message
      : "Check your email for the sign-in link. You can close this message afterward.";
  }
  showActionFeedback(
    error
      ? "We couldn’t send the sign-in link. Please try again."
      : "Sign-in link sent. Check your Emory email.",
    error ? "error" : "success",
  );
});

select<HTMLButtonElement>("[data-sign-out]")?.addEventListener("click", async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  showActionFeedback(
    error ? "We couldn’t sign you out. Please try again." : "You’re signed out.",
    error ? "error" : "success",
  );
});

openProposalButton?.addEventListener("click", () => {
  if (!currentUser) {
    showSignIn("suggest");
    return;
  }
  showProposal();
});

select<HTMLButtonElement>("[data-close-proposal]")?.addEventListener("click", () => {
  closeProposal();
  openProposalButton?.focus();
});

proposalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) {
    showSignIn("suggest");
    return;
  }
  const data = Object.fromEntries(new FormData(proposalForm).entries());
  const submitButton = proposalForm.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";
  }
  if (proposalStatus) proposalStatus.textContent = "Sending your suggestion…";
  const { error } = await supabase.from("article_suggestions").insert({
    title: String(data.title),
    url: String(data.url),
    citation: String(data.citation),
    topic: String(data.topic),
    rationale: String(data.rationale),
    submitter_name: String(data.submitter_name),
    submitter_id: currentUser.id,
    status: "pending",
  });
  if (proposalStatus) {
    proposalStatus.textContent = error
      ? error.message
      : "Submitted. A coordinator will review it before it appears in the public queue.";
  }
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Send to coordinators";
  }
  if (error) {
    showActionFeedback("We couldn’t submit the article. Please try again.", "error");
    return;
  }
  proposalForm.reset();
  closeProposal();
  openProposalButton?.focus();
  showActionFeedback(
    "Article suggestion submitted. Coordinators will review it before it appears in the queue.",
  );
});

async function start() {
  if (!isSupabaseConfigured || !supabase) {
    if (status) status.innerHTML = "<strong>Member queue</strong> · Demo mode";
    return;
  }
  const { data } = await supabase.auth.getSession();
  updateAuth(data.session?.user ?? null);
  try {
    await Promise.all([loadQueue(), loadPoll()]);
    resumeAction();
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unable to load the queue.";
    if (status) status.textContent = message;
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuth(session?.user ?? null);
    window.setTimeout(async () => {
      try {
        await loadPoll();
        resumeAction();
      } catch {
        showActionFeedback(
          "We couldn’t refresh the ballot. Please reload the page.",
          "error",
        );
      }
    }, 0);
  });
}

void start();
