# Site review action items

Markers: `[x]` implemented · `[→]` ongoing operating task · `[?]` decision still needed

## Naming and visual identity

- [x] Use **Emory Decision-Making Megalab** in the header and homepage hero.
- [x] Use **EDM Megalab** as the compact name on secondary pages and controls.
- [x] Remove the footer filler tagline.
- [x] Apply the official Emory primary palette: Emory Blue, dark blue, medium blue, light blue, Emory Yellow, and supporting brand tints.
- [x] Refresh the social-share image to match the new name and palette.

## Navigation and homepage clarity

- [x] Make **Propose a Session** a prominent header and homepage action.
- [x] Send session proposals directly to the session form; keep article suggestions on the separate Article Queue path.
- [x] Label the next item as **Meeting N of 14** instead of using a date-like fraction.
- [x] Remove the “Room for work at every stage” heading and the redundant balance statement.
- [x] Replace ambiguous archive language with direct labels such as **Materials archive** and **Completed meetings and resources**.

## Article queue and polls

- [x] Use **What should we read next?** as the Article Queue prompt.
- [x] Remove “worth the group’s time” and similar wording.
- [x] Remove manual poll-title entry; new polls use the selected session date as their title.
- [x] Remove the manual poll-title field from the coordinator issue template as well.

## Reading room

- [x] Replace priority, methods, and reserve-list labels with research keywords.
- [x] Make every keyword badge clickable and filterable.
- [x] Assign each keyword a stable color based on its text.
- [x] Add a `presented` field and a visible **Presented / Not yet presented** status filter.
- [→] After each article discussion, set that reading’s `presented` value to `true` and optionally add `presentedOn` in `src/data/readings.json`.

## Decisions that remain open

- [?] Decide whether coordinators will actively recruit works-in-progress presenters, rely mainly on self-submission, or use a hybrid cadence.
- [?] Decide whether completed meeting pages should combine AI-generated notes, public materials, and article links in one view. The current meeting pages already provide the structure for public materials and article links; AI notes need a policy and workflow before implementation.
