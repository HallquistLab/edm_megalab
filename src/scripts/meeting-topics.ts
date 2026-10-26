import { supabase } from "../lib/supabase";
import { siteBase, topicStatusLabels, type Topic } from "../lib/topics";

const section = document.querySelector<HTMLElement>("[data-meeting-topics]");
const list = section?.querySelector<HTMLElement>("[data-meeting-topic-list]");
const status = section?.querySelector<HTMLElement>("[data-meeting-topics-status]");
const retry = section?.querySelector<HTMLButtonElement>("[data-meeting-topics-retry]");

function topicCard(topic: Topic) {
  const card = document.createElement("article");
  card.className = "meeting-topic-card";
  const label = document.createElement("span");
  label.className = "topic-status";
  label.textContent = topicStatusLabels[topic.status];
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.textContent = topic.title;
  link.href = `${siteBase}topics/?topic=${encodeURIComponent(topic.id)}#topic-${encodeURIComponent(topic.id)}`;
  heading.append(link);
  card.append(label, heading);
  if (topic.description) {
    const context = document.createElement("p");
    context.className = "topic-description";
    context.textContent = topic.description;
    card.append(context);
  }
  return card;
}

async function loadTopics() {
  if (!supabase || !section || !list || !status || !retry) return;
  retry.disabled = true;
  list.setAttribute("aria-busy", "true");
  try {
    const { data, error } = await supabase.rpc("get_topics");
    if (error) throw error;
    // Coordinators receive private topics too. Only published meeting links
    // belong on this page, regardless of who is signed in.
    const topics = ((data ?? []) as Topic[]).filter(
      (topic) =>
        topic.scheduled_meeting_id === section.dataset.meetingId &&
        (topic.status === "scheduled" || topic.status === "discussed"),
    );
    list.replaceChildren(...topics.map(topicCard));
    status.hidden = retry.hidden = true;
    section.hidden = topics.length === 0;
  } catch {
    section.hidden = false;
    status.hidden = retry.hidden = false;
    status.textContent = "Related topics could not be loaded. Please try again.";
  } finally {
    list.setAttribute("aria-busy", "false");
    retry.disabled = false;
  }
}

retry?.addEventListener("click", () => void loadTopics());
void loadTopics();
