# Emory Decision-Making Megalab

A content-driven Astro website for coordinating the Emory Decision-Making Joint Lab Meetings. The site is designed to remain lightweight, deploy automatically through GitHub Pages, and make routine updates possible without changing page components.

## Routine updates

- **Meeting dates, details, and public materials:** edit [`src/data/schedule.json`](src/data/schedule.json). Each meeting has a permanent page; after its date passes, it appears automatically under **Past meetings** and in the **Materials** archive.
- **Default time, location, and calendar behavior:** edit [`src/data/site.json`](src/data/site.json).
- **Reading room:** edit [`src/data/readings.json`](src/data/readings.json).
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

Supported material types are `slides`, `notes`, `code`, `recording`, `handout`, `dataset`, and `other`. Existing meeting `readings` are included on the meeting page and in the archive automatically.

Local planning documents belong in the ignored `documentation/` folder. Do not link to or commit that folder; move only deliberately public material into the site source.

Calendar files are regenerated from the schedule automatically before every production build. The stable subscription feed lives at `calendar/edm-megalab.ics`; keep that filename unchanged so existing subscribers continue receiving updates. If time and location are not yet set, events are exported as transparent, all-day tentative placeholders so they reserve the date without falsely implying logistics.

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
