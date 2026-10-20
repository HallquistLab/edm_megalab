// Verify the public URL migration against built pages and calendar files.
// Run after an Astro build; no browser, network, or database is required.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const schedule = JSON.parse(await read("src/data/schedule.json"));
const site = JSON.parse(await read("src/data/site.json"));
const home = await read("dist/index.html");
const pageRoot = home.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
assert.ok(pageRoot, "Homepage must provide a canonical URL");
const routes = new Set();
const calendarUids = new Set();
const unfold = (text) => text.replace(/\r?\n[ \t]/g, "");
const icsField = (text, key) =>
  unfold(text)
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${key}:`))
    ?.slice(key.length + 1);

for (const session of schedule) {
  assert.match(session.date, /^\d{4}-\d{2}-\d{2}$/);
  const canonicalPath = `/meetings/${session.date}/`;
  const canonicalUrl = `${site.publicUrl}${canonicalPath}`;
  const html = await read(`dist/meetings/${session.date}/index.html`);
  const pageUrl = `${pageRoot}meetings/${session.date}/`;
  assert.ok(html.includes(pageUrl), `Missing canonical URL: ${pageUrl}`);
  assert.ok(
    !html.includes('http-equiv="refresh"'),
    "Date pages must render meeting content",
  );
  assert.ok(html.includes(`calendar/${session.date}.ics`));
  assert.ok(!routes.has(session.date), `Duplicate meeting date: ${session.date}`);
  routes.add(session.date);

  const dateCalendar = await read(`public/calendar/${session.date}.ics`);
  const uid = icsField(dateCalendar, "UID");
  assert.ok(uid && !calendarUids.has(uid), `Duplicate or missing calendar UID: ${uid}`);
  calendarUids.add(uid);
  assert.equal(icsField(dateCalendar, "URL"), canonicalUrl);

  for (const alias of new Set([session.id, ...(session.legacyIds ?? [])])) {
    if (alias === session.date) continue;
    assert.ok(!routes.has(alias), `Conflicting legacy meeting path: ${alias}`);
    routes.add(alias);
    const redirect = await read(`dist/meetings/${alias}/index.html`);
    assert.ok(redirect.includes('http-equiv="refresh"'), `No redirect for ${alias}`);
    assert.ok(
      redirect.includes(canonicalPath),
      `Redirect must go directly to ${canonicalPath}`,
    );
    const legacyCalendar = await read(`public/calendar/${alias}.ics`);
    assert.equal(
      icsField(legacyCalendar, "UID"),
      uid,
      `Changed event identity at ${alias}`,
    );
    assert.equal(icsField(legacyCalendar, "URL"), canonicalUrl);
  }
}

// These subscriber event identities predate the URL cleanup and must not change.
assert.equal(
  icsField(await read("public/calendar/2026-10-23.ics"), "UID"),
  "2026-10-23-fmri-preprocessing@edm-megalab.emory.edu",
);
assert.equal(
  icsField(await read("public/calendar/2026-09-25.ics"), "UID"),
  "2026-10-09-computational-phenotypes@edm-megalab.emory.edu",
);

for (const feed of ["edm-megalab.ics", "edm-megalab-2026-27.ics"]) {
  const calendar = unfold(await read(`public/calendar/${feed}`));
  assert.equal(calendar.split("BEGIN:VEVENT").length - 1, schedule.length);
  for (const uid of calendarUids) assert.ok(calendar.includes(`UID:${uid}\r\n`));
  for (const match of calendar.matchAll(/^URL:(.+)$/gm)) {
    assert.match(match[1].trim(), /\/meetings\/\d{4}-\d{2}-\d{2}\/$/);
  }
}

for (const page of [
  "index.html",
  "schedule/index.html",
  "materials/index.html",
  ...schedule.map((session) => `meetings/${session.date}/index.html`),
]) {
  const html = await read(`dist/${page}`);
  for (const match of html.matchAll(/href="[^"]*\/meetings\/([^/"#?]+)\//g)) {
    assert.match(match[1], /^\d{4}-\d{2}-\d{2}$/, `Old topic URL in ${page}`);
  }
}

let indexedMeetings = 0;
for (const filename of await readdir(new URL("../dist/", import.meta.url))) {
  if (!/^sitemap-\d+\.xml$/.test(filename)) continue;
  const sitemap = await read(`dist/${filename}`);
  for (const match of sitemap.matchAll(/<loc>([^<]*\/meetings\/[^<]+)<\/loc>/g)) {
    assert.match(
      match[1],
      /\/meetings\/\d{4}-\d{2}-\d{2}\/$/,
      "Sitemap must index only date-based meeting URLs",
    );
    indexedMeetings++;
  }
}
assert.equal(
  indexedMeetings,
  schedule.length,
  "Sitemap must include every canonical meeting",
);

console.log(
  `Verified ${schedule.length} date-based meeting pages, all legacy redirects and calendar links, and stable subscription event identities.`,
);
