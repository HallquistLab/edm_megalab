import scheduleData from "../data/schedule.json";
import readingsData from "../data/readings.json";
import siteData from "../data/site.json";
import type { Reading, Session, SiteConfig } from "../types";

export const schedule = scheduleData as Session[];
export const readings = readingsData as Reading[];
const site = siteData as SiteConfig;

export const getMeetingTimes = (semester: Session["semester"]) =>
  site.semesterTimes?.[semester] ?? site;

export const formatDate = (date: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));

export const weekday = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(
    new Date(`${date}T12:00:00Z`),
  );

export const formatTime = (time: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: time.endsWith(":00") ? undefined : "2-digit",
  })
    .format(new Date(`2000-01-01T${time}:00`))
    .replace(" AM", " a.m.")
    .replace(" PM", " p.m.");
