// Event-specific times, speaker details, and rescheduling must agree across
// the published pages and exported calendars. Run after a production build.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const schedule = JSON.parse(await read("src/data/schedule.json"));
const site = JSON.parse(await read("src/data/site.json"));
const agenda = await read("dist/schedule/index.html");
const unfold = (text) => text.replace(/\r\n[ \t]/g, "");
assert.deepEqual(
  schedule.map((s) => s.date),
  schedule.map((s) => s.date).sort(),
  "Events must be chronological",
);
assert.ok(
  agenda.includes('data-filter="external-speaker"'),
  "Schedule must expose the speaker filter",
);

for (const session of schedule) {
  const overridesTime = "startTime" in session || "endTime" in session;
  if (overridesTime) {
    assert.ok(
      "startTime" in session && "endTime" in session,
      "Override both times together",
    );
    assert.equal(
      session.startTime === null,
      session.endTime === null,
      "Unknown times must both be null",
    );
    if (session.startTime !== null) {
      assert.match(session.startTime, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
      assert.match(session.endTime, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
      assert.ok(session.startTime < session.endTime, "Events must end after they start");
    }
  }
  const times = overridesTime
    ? session
    : (site.semesterTimes?.[session.semester] ?? site);
  const calendar = await read(`public/calendar/${session.date}.ics`);
  for (const line of calendar.split("\r\n")) {
    assert.ok(
      Buffer.byteLength(line, "utf8") <= 75,
      "Fold calendar lines by UTF-8 bytes",
    );
  }
  const event = unfold(calendar);
  const date = session.date.replaceAll("-", "");
  if (times.startTime && times.endTime) {
    assert.ok(
      event.includes(
        `DTSTART;TZID=America/New_York:${date}T${times.startTime.replace(":", "")}00\r\n`,
      ),
    );
    assert.ok(
      event.includes(
        `DTEND;TZID=America/New_York:${date}T${times.endTime.replace(":", "")}00\r\n`,
      ),
    );
  } else {
    assert.ok(event.includes(`DTSTART;VALUE=DATE:${date}\r\n`));
    assert.ok(
      !event.includes("DTSTART;TZID="),
      "Save-the-dates must not inherit semester times",
    );
    assert.ok(event.includes("TRANSP:TRANSPARENT"));
  }
}

const speakers = [
  ["2026-10-30", "Don Robinaugh", "12:00", "13:30", "12 p.m.–1:30 p.m."],
  ["2026-11-09", "Shari Hamm", "13:00", "14:30", "1 p.m.–2:30 p.m."],
  ["2026-11-20", "Amrita Lamba", "12:00", "13:30", "12 p.m.–1:30 p.m."],
  ["2026-12-04", "Ashley Watts", "12:00", "13:30", "12 p.m.–1:30 p.m."],
  ["2027-02-17", "Şerife Tekin", null, null, "Time to be announced"],
];
assert.equal(
  schedule.filter((s) => s.type === "external-speaker").length,
  speakers.length,
);
for (const [date, name, start, end, label] of speakers) {
  const session = schedule.find((s) => s.date === date);
  assert.equal(session?.type, "external-speaker");
  assert.equal(session.presenter, name);
  assert.equal(session.startTime, start);
  assert.equal(session.endTime, end);
  const page = await read(`dist/meetings/${date}/index.html`);
  assert.ok(page.includes(label), `Wrong page time for ${name}`);
  assert.ok(page.includes(name), `Missing speaker name for ${date}`);
  assert.ok(
    page.includes(session.presenterUrl.replaceAll("&", "&amp;")),
    "Preserve the supplied speaker profile link",
  );
  const item = agenda.match(
    new RegExp(`<article[^>]*id="${session.id}"[\\s\\S]*?</article>`),
  )?.[0];
  assert.ok(item?.includes(label), `Wrong agenda time for ${name}`);
}

const robinaugh = schedule.find((s) => s.presenter === "Don Robinaugh");
const robinaughPage = await read("dist/meetings/2026-10-30/index.html");
assert.ok(
  robinaughPage.includes(robinaugh.abstract),
  "Publish the complete supplied abstract",
);
assert.ok(robinaughPage.includes("PAIS 280"));
const tekinCalendar = unfold(await read("public/calendar/2027-02-17.ics"));
assert.ok(
  tekinCalendar.includes("Şerife Tekin"),
  "Preserve Unicode through calendar folding",
);
assert.ok(tekinCalendar.includes("DTEND;VALUE=DATE:20270218"));
assert.equal(schedule.find((s) => s.id === "2026-11-20-wip-2")?.date, "2027-01-22");
assert.ok(
  !schedule.some((s) => s.date === "2026-11-13"),
  "Do not retain the tentative November discussion",
);
assert.equal(
  schedule.filter((s) => s.date === "2027-01-22").length,
  1,
  "Replace the unassigned January placeholder",
);
const springArticle = unfold(await read("public/calendar/2027-01-22.ics"));
assert.ok(springArticle.includes("DTSTART;TZID=America/New_York:20270122T103000"));
assert.ok(springArticle.includes("DTEND;TZID=America/New_York:20270122T120000"));
assert.ok(
  unfold(await read("public/calendar/2026-11-13.ics")).includes(
    "UID:2026-11-20-wip-2@edm-megalab.emory.edu",
  ),
);
assert.ok(
  unfold(await read("public/calendar/2026-12-04.ics")).includes(
    "UID:2026-12-04-decision-neuroscience@edm-megalab.emory.edu",
  ),
);
assert.equal(
  schedule.filter((s) => s.date === "2026-12-04").length,
  1,
  "Do not retain a conflicting TBA slot",
);
assert.ok(!schedule.some((s) => s.date === "2026-11-27"), "Avoid Thanksgiving recess");
assert.ok(
  !schedule.some((s) => s.date >= "2026-12-10" && s.date <= "2026-12-19"),
  "Avoid fall exams",
);
console.log(
  "Verified speaker events, event-specific times, unknown-time save-the-dates, complete abstracts, UTF-8 calendars, and stable identities after rescheduling.",
);
