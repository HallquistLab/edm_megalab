# Emory Decision-Making Megalab

A content-driven Astro website for coordinating the Emory Decision-Making Joint Lab Meetings. The site is designed to remain lightweight, deploy automatically through GitHub Pages, and make routine updates possible without changing page components.

## Routine updates

- **Meeting dates, details, and public materials:** edit [`src/data/schedule.json`](src/data/schedule.json). Each meeting has a date-based page at `/meetings/YYYY-MM-DD/`; after its date passes, it appears automatically under **Past meetings** and in the **Materials** archive.
- **Default time, location, and calendar behavior:** edit [`src/data/site.json`](src/data/site.json). Use `semesterTimes` for semester-specific start and end times; these apply to meeting pages, the homepage, the schedule, and calendar files.
- **Reading room:** edit [`src/data/readings.json`](src/data/readings.json).
- **About us:** edit lab and PI profiles, including their public source links, in [`src/data/labs.json`](src/data/labs.json). The Megalab's mission and goals live in [`src/pages/about/index.astro`](src/pages/about/index.astro).
- **Topics:** members suggest lightweight ideas and upvote at `/topics/`. Coordinators approve suggestions, refine wording, archive duplicates, and link topics to published meetings at `/admin/`.
- **Session proposals, article queue, and ballot:** visitors propose sessions at `/propose/`; members submit articles and vote; coordinators review everything at `/admin/`. Supabase stores the private proposals, live queue, and ballots.
- **Standing resources:** edit [`src/pages/materials/index.astro`](src/pages/materials/index.astro). Keep sensitive WIP material in a private Emory location.

To attach a public resource to a meeting, add a `materials` array to that meeting in `schedule.json`:

```json
"materials": [
  {
    "type": "slides",
    "label": "Slides",
    "title": "Workshop slides",
    "url": "https://example.com/slides",
    "description": "Optional short context for the resource"
  }
]
```

For meetings with multiple talks, add a `presentations` array with a `presenter`, optional `title`, and optional `description` summarizing each talk. Omit a title until it is confirmed; it will appear as “Title to be announced.” These entries appear separately on the meeting page and in calendar descriptions.

Supported material types are `slides`, `notes`, `code`, `recording`, `handout`, `dataset`, and `other`. Existing meeting `readings` are included on the meeting page and in the archive automatically.

Local planning documents belong in the ignored `documentation/` folder. Do not link to or commit that folder; move only deliberately public material into the site source.

Meeting pages and per-meeting calendar downloads use date-based URLs (`/meetings/YYYY-MM-DD/` and `/calendar/YYYY-MM-DD.ics`), independent of the meeting topic. Calendar files are regenerated from the schedule automatically before every production build. Keep existing meeting `id` values unchanged when rescheduling or renumbering sessions. If a misleading ID must be corrected, put all prior IDs in `legacyIds`, with the original ID first. Internal meeting IDs remain stable for existing Topics links and calendar event identities. Old topic-based meeting pages redirect directly to the current date-based page, old calendar download URLs remain available, and the first legacy ID preserves the calendar event UID so subscribers do not receive duplicates. If a meeting is moved to another date, preserve its previous date in `legacyIds` as well. Preserve the event UID by keeping the original first legacy ID; if the meeting has no legacy IDs yet, put its unchanged internal `id` first and the former date second. Internal IDs do not determine public URLs. The stable subscription feed lives at `calendar/edm-megalab.ics`; keep that filename unchanged so existing subscribers continue receiving updates. If time and location are not yet set, events are exported as transparent, all-day tentative placeholders so they reserve the date without falsely implying logistics.

## Local preview

Requires Node.js 24 or later.

```bash
npm install
npm run dev
```

The project includes formatting, type checks, and a production build:

```bash
npm run format
npm run build
```

## Publishing

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes the site whenever `main` is pushed. In the GitHub repository settings, select **GitHub Actions** as the Pages source once; subsequent updates deploy automatically.

The public URL is configured as <https://hallquistlab.github.io/edm_megalab/>.

## Article queue and polling

The static GitHub Pages frontend uses Supabase for persistent article suggestions, magic-link member access, and capped approval ballots. No service-role or secret key is included in the browser bundle.

1. Create a dedicated Supabase project and run the files in [`supabase/migrations/`](supabase/migrations/) in filename order in its SQL editor.
2. Add the first coordinator with `insert into public.app_admins (email) values ('name@emory.edu');` in the SQL editor.
3. Copy `.env.example` to `.env` and fill in the project URL and publishable key from **Project Settings → API**. Never use a service-role or secret key in a `PUBLIC_` variable.
4. In Supabase Auth URL configuration, set the production Site URL to `https://hallquistlab.github.io/edm_megalab/` and allow both `https://hallquistlab.github.io/edm_megalab/**` and `http://127.0.0.1:4321/**` as redirect URLs.
5. Restart the development server after changing environment variables.

The public proposal form accepts private WIP, current-topic, and workshop proposals without requiring an account. Only approved coordinators can read them; the console hides archived proposals by default and can restore them when needed. The public article page reads only queued suggestions and open poll totals. Members authenticate with an `@emory.edu` magic link to suggest papers or vote. The coordinator console can also approve or archive pending article suggestions, create polls from two to eight queued articles, set a closing time, and close or reopen a ballot. The database enforces the configured approval limit; the default is three choices per member.

Without Supabase environment variables, both pages remain in a polished demo mode so the visual mock-up can still be reviewed locally.

## Topics and member interest

The topic board uses the same Supabase client, persisted session, Emory email sign-in helper, and member access component as the article page. Topic suggestions require a title and accept optional context; they carry no presentation commitment. Each suggestion starts as `pending` and appears only to its submitter and coordinators until approved.

Apply `supabase/migrations/202610200001_topics.sql` to the existing Supabase project **before publishing this frontend**. It adds `topics`, `topic_votes`, row-level security, explicit column grants, and the `get_topics()` aggregate function. The earlier community migration must already be installed. The migration does not modify article ballots or expose private session proposals. It is additive and intentionally does not seed the board with unapproved draft topics.

The October 9 meeting themes are provided by `supabase/migrations/202610200002_seed_meeting_topics.sql`: clinical translation, comparisons across labs, study design and analysis, applications and misuses of methods, and grant proposal ideas. These coordinator-curated group suggestions have no personal submitter, assigned meeting, or initial votes. Member submissions still require the signed-in member’s own ID. Stable seed IDs make this migration safe to rerun without duplicating topics or replacing coordinator edits and votes.

The existing authentication redirect allowlist (`https://hallquistlab.github.io/edm_megalab/**`) covers `/topics/`; add the local preview origin if using a different port. Returning from the sign-in link reopens a suggestion or returns to the chosen topic. A vote still requires an explicit click after sign-in.

Coordinator workflow:

The console can sort topics by interest or recency and filter by each status. Unsaved edits are kept in memory per topic while saving another topic, changing views, or refreshing the list. Each changed topic shows **Discard changes**, and leaving the page prompts before drafts are lost. Drafts are not stored across page reloads and are cleared on sign-out or account changes. Authentication token refreshes preserve drafts.

1. In **Topics**, review the pending suggestion. Refine the title/context if needed and choose **Approve for interest**, or set **Archived** and save to decline a suggestion or consolidate duplicates. Duplicate handling is manual; votes are not transferred automatically.
2. Members can show interest in any number of topics marked `open` or `planning`, once per member and topic. They can remove that interest while these statuses remain active. The database enforces ownership and uniqueness. Counts are public; individual choices and submitter IDs are not returned by the board API.
3. Use **In planning** while arranging a session. Confirm the program in `src/data/schedule.json` and publish it through the normal build/deployment workflow.
4. Choose that published meeting in the coordinator dropdown and save the topic as **Scheduled** (or **Discussed** afterward). These states require a meeting ID and preserve existing vote totals. Voting is closed for scheduled, discussed, pending, and archived topics.

Meeting references use the stable IDs in `schedule.json`; the console validates choices against this file and offers a preview link to the selected meeting. The board creates links only for IDs present in the published schedule. A topic can link to one meeting in this first version. Meeting pages load their linked Scheduled/Discussed topics from Supabase, with links back to the specific topic on the board. These links appear immediately after saving in the console, without a GitHub deployment. Pending and archived topics are excluded even for signed-in coordinators. A console edit does not change the static meeting program or calendar. If meeting dates or IDs are added to the source, deploy that source before linking them in the console.

If the Topics migration is missing or the backend is unavailable, the board shows a retry message. The console isolates topic-loading failures so the existing article/proposal tools still work. Without Supabase configuration, Topics clearly reports that participation is unavailable and shows no fabricated vote counts.

### Topics verification

```bash
npm run test:topics:db
```

Requires Python 3 and PostgreSQL's `initdb`, `pg_ctl`, and `psql` on `PATH`. This creates and removes a disposable database with a local Unix socket and no TCP listener. The tests apply the actual community and Topics migrations with test Supabase roles/JWT helpers, then exercise public/private visibility, Emory membership, approval permissions, vote ownership, uniqueness/removal, scheduled meeting constraints, and coexistence with article ballots. No production database is contacted.

For browser checks, run the configured local site on port 4325, install Python Playwright and its Chromium browser, then run:

```bash
npm run dev -- --host 127.0.0.1 --port 4325
npm run test:topics:browser
```

The browser suite mocks every Supabase request; it sends no emails and writes no live records. It checks sign-in redirects, a shared article-page session, suggestions, upvotes/removal, filters, scheduled meeting links, coordinator approval/editing/scheduling/archiving, error recovery, and mobile overflow. Set `TOPICS_TEST_URL` for another preview URL, or `TOPICS_TEST_BROWSER_CHANNEL=chrome` to use an installed Chrome browser in a temporary profile. Finish with `npm run build` to verify the production site. Its postbuild check (`npm run test:meeting-urls`) verifies date-based routes, legacy redirects, calendar download aliases, and subscriber event identities.
