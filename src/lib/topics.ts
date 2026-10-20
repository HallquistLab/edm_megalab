import schedule from "../data/schedule.json";

export const topicStatusLabels = {
  pending: "Awaiting review",
  open: "Collecting interest",
  planning: "In planning",
  scheduled: "Scheduled",
  discussed: "Discussed",
  archived: "Archived",
} as const;

export type TopicStatus = keyof typeof topicStatusLabels;

export interface Topic {
  id: string;
  title: string;
  description: string;
  status: TopicStatus;
  scheduled_meeting_id: string | null;
  created_at: string;
  interests: number;
  is_interested: boolean;
  is_owner: boolean;
}

export const canVoteOnTopic = (topic: Topic) =>
  topic.status === "open" || topic.status === "planning";

// The schedule remains the source of truth for published meeting URLs.
export const topicMeeting = (id: string | null) =>
  id ? schedule.find((meeting) => meeting.id === id) : undefined;

export const siteBase = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
