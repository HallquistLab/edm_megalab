import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schedule = JSON.parse(
  await readFile(path.join(root, "src/data/schedule.json"), "utf8"),
);
const site = JSON.parse(await readFile(path.join(root, "src/data/site.json"), "utf8"));
const outputDirectory = path.join(root, "public/calendar");

const escapeIcs = (value) =>
  String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

const compactDate = (date) => date.replaceAll("-", "");

const nextDate = (date) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const compactTime = (time) => time.replace(":", "") + "00";

const foldLine = (line) => {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
};

const eventLines = (session) => {
  const logistics = site.location
    ? `Location: ${site.location}`
    : "Time and location to be announced";
  const featuredArticles = session.readings
    .filter((reading) => reading.title)
    .map(
      (reading) =>
        `Featured article: ${reading.title}. Authors: ${reading.authors}. Journal: ${reading.journal} (${reading.year}). ${reading.url}`,
    )
    .join(" ");
  const description = `${session.typeLabel}. ${session.description} ${featuredArticles} Lead: ${session.presenter}. ${logistics}.`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${session.id}@edm-megalab.emory.edu`,
    `DTSTAMP:${compactDate(new Date().toISOString().slice(0, 10))}T120000Z`,
  ];

  if (site.startTime && site.endTime) {
    lines.push(
      `DTSTART;TZID=${site.timezone}:${compactDate(session.date)}T${compactTime(site.startTime)}`,
      `DTEND;TZID=${site.timezone}:${compactDate(session.date)}T${compactTime(site.endTime)}`,
    );
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate(session.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDate(session.date))}`,
    );
  }

  return [
    ...lines,
    `SUMMARY:${escapeIcs(session.title)} — Emory Decision-Making Megalab`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(site.location ?? "To be announced")}`,
    `URL:${site.publicUrl}/schedule/#${session.id}`,
    "STATUS:TENTATIVE",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
};

const calendar = (sessions, name) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Emory Decision-Making Megalab//Meeting Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(name)}`,
    `X-WR-TIMEZONE:${site.timezone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...sessions.flatMap(eventLines),
    "END:VCALENDAR",
    "",
  ]
    .map(foldLine)
    .join("\r\n");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "edm-megalab.ics"), calendar(schedule, site.name)),
  writeFile(
    path.join(outputDirectory, "edm-megalab-2026-27.ics"),
    calendar(schedule, `${site.name} ${site.academicYear}`),
  ),
  ...schedule.map((session) =>
    writeFile(
      path.join(outputDirectory, `${session.id}.ics`),
      calendar([session], session.title),
    ),
  ),
]);

console.log(`Generated ${schedule.length + 2} calendar files.`);
