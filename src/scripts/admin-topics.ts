import { supabase } from "../lib/supabase";
import { schedule } from "../lib/content";
import { formatSessionDate } from "../lib/dates";
import {
  siteBase,
  topicMeeting,
  topicStatusLabels,
  type Topic,
  type TopicStatus,
} from "../lib/topics";
import { showActionFeedback } from "./feedback";

const list = document.querySelector<HTMLElement>("[data-admin-topics]");
const filter = document.querySelector<HTMLSelectElement>("[data-admin-topic-filter]");
const count = document.querySelector<HTMLElement>("[data-topic-review-count]");
const sort = document.querySelector<HTMLSelectElement>("[data-admin-topic-sort]");
const feedback = document.querySelector<HTMLElement>("[data-admin-topics-status]");
const draftCount = document.querySelector<HTMLElement>("[data-topic-draft-count]");
type TopicDraft = Pick<
  Topic,
  "title" | "description" | "status" | "scheduled_meeting_id"
>;
const drafts = new Map<string, TopicDraft>();
const saving = new Set<string>();
const saveErrors = new Map<string, string>();
let topics: Topic[] = [];
let generation = 0;
let accountGeneration = 0;

function updateDraftCount() {
  if (!draftCount) return;
  draftCount.hidden = drafts.size === 0;
  draftCount.textContent = `${drafts.size} ${drafts.size === 1 ? "topic has" : "topics have"} unsaved changes. Drafts stay while you filter, sort, or refresh. Save before leaving this page.`;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function topicEditor(topic: Topic) {
  const draft = drafts.get(topic.id) ?? topic;
  const card = node("article", "admin-topic-card");
  card.dataset.topicId = topic.id;
  const header = node("div", "admin-topic-heading");
  header.append(
    node("h3", "", topic.title),
    node("span", "topic-status", topicStatusLabels[topic.status]),
  );
  card.append(
    header,
    node(
      "p",
      "moderation-meta",
      `${topic.interests} interested · Submitted ${formatSessionDate(topic.created_at.slice(0, 10))}`,
    ),
  );
  const form = node("form", "topic-editor");
  const titleLabel = node("label", "", "Topic title");
  const title = node("input");
  title.name = "title";
  title.value = draft.title;
  title.required = true;
  title.minLength = 3;
  title.maxLength = 200;
  titleLabel.append(title);
  const descriptionLabel = node("label", "", "Context (optional)");
  const description = node("textarea");
  description.name = "description";
  description.rows = 2;
  description.maxLength = 1500;
  description.value = draft.description;
  descriptionLabel.append(description);
  const controls = node("div", "form-split");
  const statusLabel = node("label", "", "Topic status");
  const status = node("select");
  status.name = "status";
  for (const [value, label] of Object.entries(topicStatusLabels)) {
    const option = node("option", "", label);
    option.value = value;
    option.selected = value === draft.status;
    status.append(option);
  }
  statusLabel.append(status);
  const meetingLabel = node("label", "", "Published meeting");
  const meeting = node("select");
  meeting.name = "scheduled_meeting_id";
  const empty = node("option", "", "Choose a meeting");
  empty.value = "";
  meeting.append(empty);
  for (const session of schedule) {
    const option = node(
      "option",
      "",
      `${formatSessionDate(session.date)} · ${session.title}`,
    );
    option.value = session.id;
    option.selected = session.id === draft.scheduled_meeting_id;
    meeting.append(option);
  }
  const missingMeeting =
    draft.scheduled_meeting_id && !topicMeeting(draft.scheduled_meeting_id);
  const message = node("p", "form-status");
  message.setAttribute("role", "status");
  message.textContent = saveErrors.get(topic.id) ?? "";
  if (missingMeeting)
    message.textContent =
      "The linked meeting is no longer in the published schedule. Choose a current meeting before saving.";
  meetingLabel.append(meeting);
  const meetingLink = node("a", "text-link", "View published meeting →");
  meetingLink.target = "_blank";
  meetingLink.rel = "noopener";
  const unsaved = node("span", "topic-draft-label", "Unsaved changes");
  unsaved.hidden = !drafts.has(topic.id);
  const discard = node("button", "text-button", "Discard changes");
  discard.type = "button";
  discard.hidden = !drafts.has(topic.id);
  const readDraft = (): TopicDraft => ({
    title: title.value,
    description: description.value,
    status: status.value as TopicStatus,
    scheduled_meeting_id: meeting.disabled ? null : meeting.value || null,
  });
  const rememberDraft = () => {
    const next = readDraft();
    const changed =
      next.title !== topic.title ||
      next.description !== topic.description ||
      next.status !== topic.status ||
      next.scheduled_meeting_id !== topic.scheduled_meeting_id;
    if (changed) drafts.set(topic.id, next);
    else drafts.delete(topic.id);
    unsaved.hidden = discard.hidden = !changed;
    updateDraftCount();
  };
  const syncMeeting = () => {
    const needsMeeting = status.value === "scheduled" || status.value === "discussed";
    meeting.required = needsMeeting;
    meeting.disabled = !needsMeeting && status.value !== "archived";
    const session = !meeting.disabled ? topicMeeting(meeting.value) : undefined;
    meetingLink.hidden = !session;
    if (session) meetingLink.href = `${siteBase}meetings/${session.date}/`;
  };
  status.addEventListener("change", syncMeeting);
  syncMeeting();
  form.addEventListener("input", rememberDraft);
  form.addEventListener("change", () => {
    syncMeeting();
    rememberDraft();
  });
  discard.addEventListener("click", () => {
    drafts.delete(topic.id);
    saveErrors.delete(topic.id);
    render();
    list?.querySelector<HTMLInputElement>(`[data-topic-id="${topic.id}"] input`)?.focus();
  });
  controls.append(statusLabel, meetingLabel);
  const save = node(
    "button",
    "button button-primary",
    topic.status === "pending" ? "Save review" : "Save topic",
  );
  save.type = "submit";
  const actions = node("div", "moderation-actions");
  if (topic.status === "pending") {
    const approve = node("button", "button button-secondary", "Approve for interest");
    approve.type = "button";
    approve.addEventListener("click", () => {
      status.value = "open";
      syncMeeting();
      rememberDraft();
      form.requestSubmit();
    });
    actions.append(approve);
  }
  actions.append(save, discard, unsaved);
  form.append(titleLabel, descriptionLabel, controls, meetingLink, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase || saving.has(topic.id)) return;
    const newStatus = status.value as TopicStatus;
    const meetingId = meeting.disabled ? null : meeting.value || null;
    if (meetingId && !topicMeeting(meetingId)) {
      message.textContent = "Choose a meeting from the published schedule.";
      return;
    }
    rememberDraft();
    const payload: TopicDraft = {
      title: title.value.trim(),
      description: description.value.trim(),
      status: newStatus,
      scheduled_meeting_id: meetingId,
    };
    const currentAccount = accountGeneration;
    saveErrors.delete(topic.id);
    saving.add(topic.id);
    const fields = [
      ...form.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
      >("input, textarea, select, button"),
    ];
    fields.forEach((field) => (field.disabled = true));
    message.textContent = "Saving…";
    try {
      const { data, error } = await supabase
        .from("topics")
        .update(payload)
        .eq("id", topic.id)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("No topic was updated.");
      if (currentAccount !== accountGeneration) return;
      drafts.delete(topic.id);
      topics = topics.map((item) =>
        item.id === topic.id ? { ...item, ...payload } : item,
      );
      showActionFeedback(
        newStatus === "open" && topic.status === "pending"
          ? "Topic approved. Members can now show interest."
          : "Topic updated.",
      );
      await loadAdminTopics();
    } catch {
      if (currentAccount !== accountGeneration) return;
      message.textContent =
        "We couldn’t save this topic. Check coordinator access and try again.";
      saveErrors.set(topic.id, message.textContent);
      showActionFeedback(message.textContent, "error");
    } finally {
      if (currentAccount === accountGeneration) {
        saving.delete(topic.id);
        render();
        if (!list?.contains(document.activeElement)) {
          const nextFocus =
            list?.querySelector<HTMLButtonElement>(
              `[data-topic-id="${topic.id}"] button[type="submit"]`,
            ) ?? filter;
          nextFocus?.focus({ preventScroll: true });
        }
      }
    }
  });
  if (saving.has(topic.id)) {
    form
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
      >("input, textarea, select, button")
      .forEach((field) => (field.disabled = true));
    message.textContent = "Saving…";
  }
  card.append(form);
  return card;
}

function render() {
  const active = document.activeElement;
  const editing =
    list?.contains(active) &&
    (active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement)
      ? active
      : null;
  const focusedTopic = editing?.closest<HTMLElement>("[data-topic-id]")?.dataset.topicId;
  const selection =
    editing instanceof HTMLTextAreaElement ||
    (editing instanceof HTMLInputElement && editing.type === "text")
      ? [editing.selectionStart, editing.selectionEnd]
      : null;
  const mode = filter?.value ?? "review";
  const visible = topics
    .filter(
      (topic) =>
        mode === "all" ||
        (mode === "review"
          ? topic.status === "pending"
          : mode === "archived"
            ? topic.status === "archived"
            : mode === "active"
              ? topic.status !== "pending" && topic.status !== "archived"
              : topic.status === mode),
    )
    .sort((a, b) => {
      if (sort?.value !== "newest" && a.interests !== b.interests)
        return b.interests - a.interests;
      return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
    });
  list?.replaceChildren(
    ...(visible.length
      ? visible.map(topicEditor)
      : [node("p", "empty-state", "No topics in this view.")]),
  );
  if (editing && focusedTopic) {
    const replacement = list?.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`[data-topic-id="${focusedTopic}"] [name="${editing.name}"]`);
    replacement?.focus({ preventScroll: true });
    if (
      selection &&
      (replacement instanceof HTMLInputElement ||
        replacement instanceof HTMLTextAreaElement)
    )
      replacement.setSelectionRange(selection[0], selection[1]);
  }
  if (count)
    count.textContent = String(
      topics.filter((topic) => topic.status === "pending").length,
    );
  updateDraftCount();
}

export function clearAdminTopics() {
  generation++;
  accountGeneration++;
  drafts.clear();
  saving.clear();
  saveErrors.clear();
  topics = [];
  list?.replaceChildren();
  if (count) count.textContent = "0";
  if (feedback) feedback.textContent = "";
  updateDraftCount();
}

export async function loadAdminTopics() {
  if (!supabase || !list) return;
  const current = ++generation;
  list.setAttribute("aria-busy", "true");
  const { data, error } = await supabase.rpc("get_topics");
  if (current !== generation) return;
  list.setAttribute("aria-busy", "false");
  if (error) {
    if (feedback)
      feedback.textContent =
        "Topic review could not be refreshed. Your unsaved changes are preserved. Try Refresh topic review again.";
    if (!topics.length)
      list.replaceChildren(node("p", "empty-state", "No topics loaded yet."));
    return;
  }
  if (feedback) feedback.textContent = "";
  topics = ((data ?? []) as Topic[]).map((topic) => ({
    ...topic,
    interests: Number(topic.interests),
  }));
  render();
}

filter?.addEventListener("change", render);
sort?.addEventListener("change", render);
window.addEventListener("beforeunload", (event) => {
  if (drafts.size) {
    event.preventDefault();
  }
});
document
  .querySelector("[data-admin-topics-refresh]")
  ?.addEventListener("click", () => void loadAdminTopics());
