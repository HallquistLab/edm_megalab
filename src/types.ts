export type SessionType =
  | "community"
  | "wip"
  | "article"
  | "methods"
  | "current-topic"
  | "external-speaker"
  | "tba";

export interface ReadingLink {
  label: string;
  url: string;
  title?: string;
  authors?: string;
  journal?: string;
  year?: number;
  description?: string;
  optional?: boolean;
}

export type MaterialType =
  | "slides"
  | "notes"
  | "code"
  | "recording"
  | "handout"
  | "dataset"
  | "other";

export interface MaterialLink {
  type: MaterialType;
  label: string;
  title: string;
  url: string;
  description?: string;
}

export interface Presentation {
  presenter: string;
  title?: string;
  description?: string;
}

export interface Session {
  id: string;
  legacyIds?: string[];
  date: string;
  semester: "Fall 2026" | "Spring 2027";
  type: SessionType;
  typeLabel: string;
  title: string;
  description: string;
  presenter: string;
  presenterAffiliation?: string;
  presenterUrl?: string;
  abstract?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  readings: ReadingLink[];
  materials?: MaterialLink[];
  presentations?: Presentation[];
}

export interface Reading {
  id: string;
  keywords: string[];
  presented: boolean;
  presentedOn?: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  citation: string;
  doi: string;
  why: string;
}

export interface MeetingTimes {
  startTime: string | null;
  endTime: string | null;
}

export interface SiteConfig extends MeetingTimes {
  name: string;
  publicUrl: string;
  academicYear: string;
  timezone: string;
  semesterTimes?: Partial<Record<Session["semester"], MeetingTimes>>;
  location: string | null;
  calendarNote: string;
}
