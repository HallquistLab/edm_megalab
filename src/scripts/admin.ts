import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";
import { formatSessionDate } from "../lib/dates";
import { keywordTone } from "../lib/keywords";
import { showActionFeedback } from "./feedback";

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

type SessionProposal = {
  id: string;
  proposal_type: "work_in_progress" | "current_topic_or_workshop";
  submitter_name: string;
  contact_email: string;
  working_title: string;
  project_stage: string;
  scientific_question: string;
  session_goals: string;
  material_to_share: string;
  discussion_preference: string;
  useful_expertise: string;
  sharing_constraints: string;
  topic_summary: string;
  relevance: string;
  desired_outcomes: string;
  suggested_format: string;
  proposed_lead: string;
  preparation_notes: string;
  status: "active" | "archived";
  created_at: string;
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
const sessionProposalList = select<HTMLElement>("[data-session-proposal-list]");
const showArchivedProposals = select<HTMLInputElement>("[data-show-archived-proposals]");
let user: User | null = null;
let suggestions: Suggestion[] = [];
let sessionProposals: SessionProposal[] = [];

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

const discussionPreferenceLabels: Record<string, string> = {
  interruptions_welcome: "Interruptions welcome",
  clarifications_only: "Clarifications during; discussion later",
  hold_questions: "Hold questions to a stopping point",
};

const formatLabels: Record<string, string> = {
  discussion: "Current-topic discussion",
  workshop: "Hands-on workshop or demonstration",
  mixed: "Short framing talk plus interactive work",
};

function proposalDetail(label: string, value: string) {
  const wrapper = node("div");
  wrapper.append(node("dt", "", label), node("dd", "", value));
  return wrapper;
}

async function setProposalStatus(id: string, status: SessionProposal["status"]) {
  if (!supabase) return false;
  const { error } = await supabase
    .from("session_proposals")
    .update({ status })
    .eq("id", id);
  if (error) {
    if (authStatus) authStatus.textContent = error.message;
    showActionFeedback("We couldn’t update that proposal. Please try again.", "error");
    return false;
  }
  showActionFeedback(
    status === "archived" ? "Session proposal archived." : "Session proposal restored.",
  );
  await loadWorkspace();
  return true;
}

function sessionProposalCard(proposal: SessionProposal) {
  const card = node(
    "article",
    `session-proposal-card${proposal.status === "archived" ? " is-archived" : ""}`,
  );
  const body = node("div");
  const typeLabel =
    proposal.proposal_type === "work_in_progress"
      ? "Work in progress"
      : "Current topic / workshop";
  body.append(
    node("span", "poll-status", typeLabel),
    node("h3", "", proposal.working_title),
    node(
      "p",
      "moderation-meta",
      `Submitted ${formatDate(proposal.created_at)} by ${proposal.submitter_name}`,
    ),
  );
  const email = node("a", "text-link", proposal.contact_email);
  email.href = `mailto:${proposal.contact_email}`;
  body.append(email);

  const details = node("dl", "session-proposal-details");
  const fields =
    proposal.proposal_type === "work_in_progress"
      ? [
          ["Project stage", proposal.project_stage],
          ["Scientific question", proposal.scientific_question],
          ["What they want from the session", proposal.session_goals],
          ["What they may show", proposal.material_to_share],
          [
            "Discussion preference",
            discussionPreferenceLabels[proposal.discussion_preference] ??
              proposal.discussion_preference,
          ],
          ["Useful expertise", proposal.useful_expertise],
          ["Sharing constraints", proposal.sharing_constraints],
        ]
      : [
          ["Topic, method, or skill", proposal.topic_summary],
          ["Why it is useful now", proposal.relevance],
          ["Desired outcomes", proposal.desired_outcomes],
          [
            "Suggested format",
            formatLabels[proposal.suggested_format] ?? proposal.suggested_format,
          ],
          ["Proposed lead", proposal.proposed_lead],
          ["Preparation or access needs", proposal.preparation_notes],
        ];
  fields.forEach(([label, value]) => {
    if (value) details.append(proposalDetail(label, value));
  });
  body.append(details);

  const actions = node("div", "moderation-actions");
  const action = node(
    "button",
    proposal.status === "archived" ? "text-button" : "button button-secondary",
    proposal.status === "archived" ? "Restore" : "Archive",
  );
  action.type = "button";
  action.addEventListener("click", async () => {
    action.disabled = true;
    const updated = await setProposalStatus(
      proposal.id,
      proposal.status === "archived" ? "active" : "archived",
    );
    if (!updated) action.disabled = false;
  });
  actions.append(action);
  card.append(body, actions);
  return card;
}

function renderSessionProposals() {
  if (!sessionProposalList) return;
  const showArchived = Boolean(showArchivedProposals?.checked);
  const visible = showArchived
    ? sessionProposals
    : sessionProposals.filter((proposal) => proposal.status === "active");
  sessionProposalList.replaceChildren(
    ...(visible.length
      ? visible.map(sessionProposalCard)
      : [
          node(
            "p",
            "empty-state",
            showArchived
              ? "No session proposals have been submitted yet."
              : "No active session proposals are waiting.",
          ),
        ]),
  );
}

async function setSuggestionStatus(id: string, status: Suggestion["status"]) {
  if (!supabase) return false;
  const { error } = await supabase
    .from("article_suggestions")
    .update({ status })
    .eq("id", id);
  if (error) {
    if (authStatus) authStatus.textContent = error.message;
    showActionFeedback("We couldn’t update that suggestion. Please try again.", "error");
    return false;
  }
  showActionFeedback(
    status === "queued" ? "Article added to the public queue." : "Article archived.",
  );
  await loadWorkspace();
  return true;
}

function moderationCard(article: Suggestion) {
  const card = node("article", "moderation-card");
  const body = node("div");
  body.append(
    node(
      "span",
      `keyword-badge keyword-static ${keywordTone(article.topic)}`,
      article.topic,
    ),
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
  const archiveButton = node("button", "text-button", "Archive");
  archiveButton.type = "button";
  queueButton.addEventListener("click", async () => {
    queueButton.disabled = true;
    archiveButton.disabled = true;
    const updated = await setSuggestionStatus(article.id, "queued");
    if (!updated) {
      queueButton.disabled = false;
      archiveButton.disabled = false;
    }
  });
  archiveButton.addEventListener("click", async () => {
    queueButton.disabled = true;
    archiveButton.disabled = true;
    const updated = await setSuggestionStatus(article.id, "archived");
    if (!updated) {
      queueButton.disabled = false;
      archiveButton.disabled = false;
    }
  });
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
      `Session date: ${formatSessionDate(poll.meeting_slot)} · closes ${formatDate(poll.closes_at)} · up to ${poll.max_approvals} votes`,
    ),
  );
  if (poll.status === "open") {
    const action = node("button", "text-button", "Close poll");
    action.type = "button";
    action.addEventListener("click", async () => {
      if (!supabase) return;
      action.disabled = true;
      action.textContent = "Closing…";
      const { error } = await supabase
        .from("polls")
        .update({ status: "closed" })
        .eq("id", poll.id);
      if (error) {
        if (authStatus) authStatus.textContent = error.message;
        action.disabled = false;
        action.textContent = "Close poll";
        showActionFeedback("We couldn’t close the poll. Please try again.", "error");
        return;
      }
      showActionFeedback("Poll closed. Voting is no longer available.");
      await loadWorkspace();
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
    { data: proposalData, error: proposalError },
  ] = await Promise.all([
    supabase
      .from("article_suggestions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("polls")
      .select("id,title,meeting_slot,closes_at,status,max_approvals")
      .order("created_at", { ascending: false }),
    supabase
      .from("session_proposals")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  if (articleError || pollError || proposalError)
    throw articleError ?? pollError ?? proposalError;
  suggestions = (articleData ?? []) as Suggestion[];
  const polls = (pollData ?? []) as Poll[];
  sessionProposals = (proposalData ?? []) as SessionProposal[];
  const pending = suggestions.filter((article) => article.status === "pending");
  setText(
    "[data-proposal-count]",
    String(sessionProposals.filter((proposal) => proposal.status === "active").length),
  );
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
  renderSessionProposals();
  renderChoices();
  pollRegister?.replaceChildren(
    ...(polls.length
      ? polls.map(pollRow)
      : [node("p", "empty-state", "No polls have been created yet.")]),
  );
}

showArchivedProposals?.addEventListener("change", renderSessionProposals);

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
    showActionFeedback("Email sign-in is not available in demo mode.", "info");
    return;
  }
  const email = String(new FormData(authForm).get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.endsWith("@emory.edu")) {
    if (authStatus) authStatus.textContent = "Please use an @emory.edu email address.";
    showActionFeedback("Please use an @emory.edu email address.", "error");
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
  showActionFeedback(
    error
      ? "We couldn’t send the sign-in link. Please try again."
      : "Sign-in link sent. Check your Emory email.",
    error ? "error" : "success",
  );
});

select<HTMLButtonElement>("[data-admin-sign-out]")?.addEventListener(
  "click",
  async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    showActionFeedback(
      error ? "We couldn’t sign you out. Please try again." : "You’re signed out.",
      error ? "error" : "success",
    );
  },
);

pollForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) {
    showActionFeedback("Sign in as a coordinator before publishing a poll.", "error");
    return;
  }
  const data = new FormData(pollForm);
  const articleIds = data.getAll("article_ids").map(String);
  if (articleIds.length < 2 || articleIds.length > 8) {
    if (pollStatus) pollStatus.textContent = "Choose between two and eight articles.";
    showActionFeedback("Choose between two and eight articles.", "error");
    return;
  }
  const submitButton = pollForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Publishing…";
  }
  if (pollStatus) pollStatus.textContent = "Publishing the ballot…";
  const closesAt = new Date(String(data.get("closes_at"))).toISOString();
  const meetingSlot = String(data.get("meeting_slot"));
  const { error } = await supabase.rpc("create_poll", {
    p_title: formatSessionDate(meetingSlot),
    p_meeting_slot: meetingSlot,
    p_closes_at: closesAt,
    p_max_approvals: Number(data.get("max_approvals")),
    p_article_ids: articleIds,
  });
  if (pollStatus)
    pollStatus.textContent = error
      ? error.message
      : "Poll published. It is now live on the article queue.";
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Publish poll";
  }
  if (error) {
    showActionFeedback("We couldn’t publish the poll. Please try again.", "error");
    return;
  }
  pollForm.reset();
  showActionFeedback("Poll published. It is now live on the article queue.");
  await loadWorkspace();
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
