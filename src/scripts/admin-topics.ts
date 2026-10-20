import { supabase } from "../lib/supabase";
import { schedule } from "../lib/content";
import { formatSessionDate } from "../lib/dates";
import {
  topicMeeting,
  topicStatusLabels,
  type Topic,
  type TopicStatus,
} from "../lib/topics";
import { showActionFeedback } from "./feedback";

const list = document.querySelector<HTMLElement>("[data-admin-topics]");
const filter = document.querySelector<HTMLSelectElement>("[data-admin-topic-filter]");
const count = document.querySelector<HTMLElement>("[data-topic-review-count]");
let topics: Topic[] = [];
let generation = 0;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function topicEditor(topic: Topic) {
  const card = node("article", "admin-topic-card");
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
  title.value = topic.title;
  title.required = true;
  title.minLength = 3;
  title.maxLength = 200;
  titleLabel.append(title);
  const descriptionLabel = node("label", "", "Context (optional)");
  const description = node("textarea");
  description.name = "description";
  description.rows = 2;
  description.maxLength = 1500;
  description.value = topic.description;
  descriptionLabel.append(description);
  const controls = node("div", "form-split");
  const statusLabel = node("label", "", "Topic status");
  const status = node("select");
  status.name = "status";
  for (const [value, label] of Object.entries(topicStatusLabels)) {
    const option = node("option", "", label);
    option.value = value;
    option.selected = value === topic.status;
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
    option.selected = session.id === topic.scheduled_meeting_id;
    meeting.append(option);
  }
  const missingMeeting =
    topic.scheduled_meeting_id && !topicMeeting(topic.scheduled_meeting_id);
  const message = node("p", "form-status");
  message.setAttribute("role", "status");
  if (missingMeeting)
    message.textContent =
      "The linked meeting is no longer in the published schedule. Choose a current meeting before saving.";
  meetingLabel.append(meeting);
  const syncMeeting = () => {
    const needsMeeting = status.value === "scheduled" || status.value === "discussed";
    meeting.required = needsMeeting;
    meeting.disabled = !needsMeeting && status.value !== "archived";
  };
  status.addEventListener("change", syncMeeting);
  syncMeeting();
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
      form.requestSubmit();
    });
    actions.append(approve);
  }
  actions.append(save);
  form.append(titleLabel, descriptionLabel, controls, message, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) return;
    const newStatus = status.value as TopicStatus;
    const meetingId = meeting.disabled ? null : meeting.value || null;
    if (meetingId && !topicMeeting(meetingId)) {
      message.textContent = "Choose a meeting from the published schedule.";
      return;
    }
    const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
    buttons.forEach((button) => (button.disabled = true));
    message.textContent = "Saving…";
    try {
      const { data, error } = await supabase
        .from("topics")
        .update({
          title: title.value.trim(),
          description: description.value.trim(),
          status: newStatus,
          scheduled_meeting_id: meetingId,
        })
        .eq("id", topic.id)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("No topic was updated.");
      showActionFeedback(
        newStatus === "open" && topic.status === "pending"
          ? "Topic approved. Members can now show interest."
          : "Topic updated.",
      );
      await loadAdminTopics();
    } catch {
      message.textContent =
        "We couldn’t save this topic. Check coordinator access and try again.";
      showActionFeedback(message.textContent, "error");
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  });
  card.append(form);
  return card;
}

function render() {
  const mode = filter?.value ?? "review";
  const visible = topics.filter(
    (topic) =>
      mode === "all" ||
      (mode === "review"
        ? topic.status === "pending"
        : mode === "archived"
          ? topic.status === "archived"
          : topic.status !== "pending" && topic.status !== "archived"),
  );
  list?.replaceChildren(
    ...(visible.length
      ? visible.map(topicEditor)
      : [node("p", "empty-state", "No topics in this view.")]),
  );
  if (count)
    count.textContent = String(
      topics.filter((topic) => topic.status === "pending").length,
    );
}

export function clearAdminTopics() {
  generation++;
  topics = [];
  list?.replaceChildren();
  if (count) count.textContent = "0";
}

export async function loadAdminTopics() {
  if (!supabase || !list) return;
  const current = ++generation;
  const { data, error } = await supabase.rpc("get_topics");
  if (current !== generation) return;
  if (error) {
    list.replaceChildren(
      node(
        "p",
        "form-status",
        "Topic review could not be loaded. Apply the Topics migration if needed, then retry.",
      ),
    );
    return;
  }
  topics = ((data ?? []) as Topic[]).map((topic) => ({
    ...topic,
    interests: Number(topic.interests),
  }));
  render();
}

filter?.addEventListener("change", render);
document
  .querySelector("[data-admin-topics-refresh]")
  ?.addEventListener("click", () => void loadAdminTopics());
