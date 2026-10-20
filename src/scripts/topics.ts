import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { requestEmorySignIn } from "../lib/member-auth";
import {
  canVoteOnTopic,
  siteBase,
  topicMeeting,
  topicStatusLabels,
  type Topic,
} from "../lib/topics";
import { formatSessionDate } from "../lib/dates";
import { showActionFeedback } from "./feedback";

const select = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector);
const list = select<HTMLElement>("[data-topic-list]");
const status = select<HTMLElement>("[data-topics-status]");
const sort = select<HTMLSelectElement>("[data-topic-sort]");
const filter = select<HTMLSelectElement>("[data-topic-filter]");
const drawer = select<HTMLElement>("[data-topic-drawer]");
const form = select<HTMLFormElement>("[data-topic-form]");
const formStatus = select<HTMLElement>("[data-topic-form-status]");
const openButton = select<HTMLButtonElement>("[data-open-topic]");
const memberPanel = select<HTMLDetailsElement>("[data-member-panel]");
const authForm = select<HTMLFormElement>("[data-auth-form]");
const authStatus = select<HTMLElement>("[data-auth-status]");
let user: User | null = null;
let topics: Topic[] = [];
let requestId = 0;
let pendingAction = new URL(window.location.href).searchParams.get("action");
let pendingTopic = new URL(window.location.href).searchParams.get("topic");

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function closeDrawer() {
  if (drawer) drawer.hidden = true;
  openButton?.setAttribute("aria-expanded", "false");
}

function showSignIn(action: string, topicId: string | null = null) {
  pendingAction = action;
  pendingTopic = topicId;
  if (memberPanel) {
    memberPanel.open = true;
    memberPanel.scrollIntoView({ block: "center" });
  }
  if (authStatus)
    authStatus.textContent =
      "Sign in with your Emory email to suggest topics or show interest.";
  select<HTMLInputElement>("#member-email")?.focus({ preventScroll: true });
}

function showDrawer() {
  if (!user) return showSignIn("suggest");
  if (memberPanel) memberPanel.open = false;
  if (drawer) drawer.hidden = false;
  openButton?.setAttribute("aria-expanded", "true");
  drawer?.scrollIntoView({ block: "start" });
  form?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
}

function updateUser(nextUser: User | null) {
  if (user?.id !== nextUser?.id) {
    requestId++;
    // Remove private pending submissions and choices immediately on account changes.
    topics = topics
      .filter((topic) => topic.status !== "pending" && topic.status !== "archived")
      .map((topic) => ({ ...topic, is_owner: false, is_interested: false }));
    render();
  }
  user = nextUser;
  if (authForm) authForm.hidden = Boolean(user);
  const signedIn = select<HTMLElement>("[data-signed-in]");
  if (signedIn) signedIn.hidden = !user;
  const email = select<HTMLElement>("[data-member-email]");
  if (email) email.textContent = user?.email ?? "";
  const label = select<HTMLElement>("[data-member-label]");
  if (label) label.textContent = user ? "Account" : "Sign in";
  const copy = select<HTMLElement>("[data-member-copy]");
  if (copy) copy.hidden = Boolean(user);
  if (!user) closeDrawer();
}

function topicCard(topic: Topic) {
  const card = node("article", "topic-card");
  card.id = `topic-${topic.id}`;
  const body = node("div", "topic-copy");
  body.append(
    node(
      "span",
      `topic-status topic-status-${topic.status}`,
      topicStatusLabels[topic.status],
    ),
  );
  const title = node("h2", "", topic.title);
  title.id = `topic-title-${topic.id}`;
  card.setAttribute("aria-labelledby", title.id);
  body.append(title);
  if (topic.description) body.append(node("p", "topic-description", topic.description));
  if (topic.status === "pending")
    body.append(
      node(
        "p",
        "moderation-meta",
        "Your suggestion is visible to you and coordinators until it is approved.",
      ),
    );
  const meeting = topicMeeting(topic.scheduled_meeting_id);
  if (meeting) {
    const link = node(
      "a",
      "text-link",
      `${topic.status === "discussed" ? "Meeting record" : "View meeting"}: ${formatSessionDate(meeting.date)} →`,
    );
    link.href = `${siteBase}meetings/${meeting.date}/`;
    body.append(link);
  }
  const actions = node("div", "topic-interest");
  actions.append(
    node(
      "p",
      "topic-count",
      `${topic.interests} ${topic.interests === 1 ? "person" : "people"} interested`,
    ),
  );
  if (canVoteOnTopic(topic)) {
    const vote = node(
      "button",
      `button ${topic.is_interested ? "button-primary" : "button-secondary"}`,
      topic.is_interested ? "Interested ✓" : "I’m interested",
    );
    vote.type = "button";
    vote.setAttribute("aria-pressed", String(topic.is_interested));
    vote.setAttribute(
      "aria-label",
      `${topic.is_interested ? "Remove interest in" : "Show interest in"} ${topic.title}`,
    );
    vote.addEventListener("click", () => {
      if (!user) return showSignIn("vote", topic.id);
      void voteForTopic(topic, vote);
    });
    actions.append(vote);
  }
  card.append(body, actions);
  return card;
}

function render() {
  if (!list) return;
  const mode = filter?.value ?? "active";
  const visible = topics
    .filter((topic) => {
      if (mode === "mine") return topic.is_interested;
      if (mode === "pending") return topic.status === "pending" && topic.is_owner;
      if (mode === "scheduled")
        return topic.status === "scheduled" || topic.status === "discussed";
      if (mode === "all") return topic.status !== "archived";
      return canVoteOnTopic(topic);
    })
    .sort((a, b) => {
      if (sort?.value !== "newest" && a.interests !== b.interests)
        return b.interests - a.interests;
      return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
    });
  const needsSignIn = !user && (mode === "mine" || mode === "pending");
  list.replaceChildren(
    ...(visible.length
      ? visible.map(topicCard)
      : [
          node(
            "p",
            "empty-state",
            needsSignIn
              ? "Sign in to see your interests and pending suggestions."
              : mode === "pending"
                ? "You have no suggestions awaiting review."
                : mode === "mine"
                  ? "Choose “I’m interested” on a topic to find it here."
                  : mode === "scheduled"
                    ? "No topics have been linked to meetings yet."
                    : "No topics to show.",
          ),
        ]),
  );
}

async function loadTopics() {
  if (!supabase) return;
  const currentRequest = ++requestId;
  list?.setAttribute("aria-busy", "true");
  const { data, error } = await supabase.rpc("get_topics");
  if (currentRequest !== requestId) return;
  list?.setAttribute("aria-busy", "false");
  if (error) {
    if (status)
      status.textContent = "Topics could not be loaded. Please try Refresh topics.";
    throw error;
  }
  topics = ((data ?? []) as Topic[]).map((topic) => ({
    ...topic,
    interests: Number(topic.interests),
  }));
  render();
  const publicCount = topics.filter(
    (topic) => topic.status !== "pending" && topic.status !== "archived",
  ).length;
  if (status)
    status.textContent = `${publicCount} community ${publicCount === 1 ? "topic" : "topics"}`;
}

function resumeAction() {
  if (!user || !pendingAction) return;
  const action = pendingAction;
  const topicId = pendingTopic;
  pendingAction = pendingTopic = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  url.searchParams.delete("topic");
  window.history.replaceState(null, "", url);
  if (memberPanel) memberPanel.open = false;
  if (action === "suggest") showDrawer();
  else if (action === "vote" && topicId) {
    if (filter) filter.value = "all";
    render();
    const card = document.getElementById(`topic-${topicId}`);
    card?.scrollIntoView({ block: "center" });
    card?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
}

async function refresh() {
  try {
    await loadTopics();
    resumeAction();
  } catch {
    showActionFeedback("We couldn’t refresh topics. Please try again.", "error");
  }
}

async function voteForTopic(topic: Topic, button: HTMLButtonElement) {
  if (!supabase || !user) return;
  const voterId = user.id;
  button.disabled = true;
  try {
    const { error } = topic.is_interested
      ? await supabase
          .from("topic_votes")
          .delete()
          .eq("topic_id", topic.id)
          .eq("voter_id", voterId)
      : await supabase
          .from("topic_votes")
          .insert({ topic_id: topic.id, voter_id: voterId });
    if (error) throw error;
    showActionFeedback(
      topic.is_interested ? "Your interest was removed." : "Your interest was recorded.",
    );
    await refresh();
    document
      .getElementById(`topic-${topic.id}`)
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  } catch {
    showActionFeedback(
      "We couldn’t change your interest. Refresh topics and try again.",
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

sort?.addEventListener("change", render);
filter?.addEventListener("change", render);
openButton?.addEventListener("click", showDrawer);
select<HTMLButtonElement>("[data-close-topic]")?.addEventListener("click", () => {
  closeDrawer();
  openButton?.focus();
});
select<HTMLButtonElement>("[data-refresh-topics]")?.addEventListener(
  "click",
  () => void refresh(),
);

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = authForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (authStatus) authStatus.textContent = "Sending your secure link…";
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("action");
    url.searchParams.delete("topic");
    if (pendingAction) url.searchParams.set("action", pendingAction);
    if (pendingTopic) url.searchParams.set("topic", pendingTopic);
    await requestEmorySignIn(
      String(new FormData(authForm).get("email") ?? ""),
      url.toString(),
    );
    if (authStatus)
      authStatus.textContent = "Check your Emory email for the sign-in link.";
    showActionFeedback("Sign-in link sent. Check your Emory email.");
  } catch (error) {
    if (authStatus)
      authStatus.textContent =
        error instanceof Error
          ? error.message
          : "We couldn’t send the sign-in link. Please try again.";
    showActionFeedback(authStatus?.textContent ?? "Sign-in failed.", "error");
  } finally {
    if (button) button.disabled = false;
  }
});

select<HTMLButtonElement>("[data-sign-out]")?.addEventListener("click", async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  showActionFeedback(
    error ? "We couldn’t sign you out. Please try again." : "You’re signed out.",
    error ? "error" : "success",
  );
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return showSignIn("suggest");
  const data = new FormData(form);
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const { error } = await supabase.from("topics").insert({
      title: String(data.get("title") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      submitter_id: user.id,
    });
    if (error) throw error;
    form.reset();
    if (formStatus)
      formStatus.textContent = "Submitted. A coordinator will review your topic.";
    closeDrawer();
    if (filter) filter.value = "pending";
    await refresh();
    openButton?.focus();
    showActionFeedback(
      "Topic sent for review. You can find it under My pending suggestions.",
    );
  } catch {
    if (formStatus)
      formStatus.textContent = "We couldn’t submit your topic. Please try again.";
    showActionFeedback("We couldn’t submit your topic. Please try again.", "error");
  } finally {
    if (button) button.disabled = false;
  }
});

async function start() {
  if (!isSupabaseConfigured || !supabase) {
    if (status)
      status.textContent =
        "Topic suggestions and voting are unavailable in this preview.";
    list?.setAttribute("aria-busy", "false");
    render();
    if (openButton) openButton.disabled = true;
    return;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error)
    showActionFeedback("We couldn’t restore sign-in. Please sign in again.", "error");
  updateUser(data.session?.user ?? null);
  await refresh();
  supabase.auth.onAuthStateChange((_event, session) => {
    updateUser(session?.user ?? null);
    // Keep database calls outside Supabase's synchronous auth callback.
    window.setTimeout(() => void refresh(), 0);
  });
}
void start();
