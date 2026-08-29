import scheduleData from "../data/schedule.json";
import readingsData from "../data/readings.json";
import type { Reading, Session } from "../types";

export const schedule = scheduleData as Session[];
export const readings = readingsData as Reading[];

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
