export type SessionType = "community" | "wip" | "article" | "methods" | "current-topic";

export interface ReadingLink {
  label: string;
  url: string;
  title?: string;
  authors?: string;
  journal?: string;
  year?: number;
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

export interface Session {
  id: string;
  date: string;
  semester: "Fall 2026" | "Spring 2027";
  type: SessionType;
  typeLabel: string;
  title: string;
  description: string;
  presenter: string;
  readings: ReadingLink[];
  materials?: MaterialLink[];
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

export interface SiteConfig {
  name: string;
  publicUrl: string;
  academicYear: string;
  timezone: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  calendarNote: string;
}
