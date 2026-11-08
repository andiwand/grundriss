# Plan

## Done

- Manual tracing on a scan, its scale, walls, doors, windows, and the file (0.1.0).
- Editing: multiple selection, copy and paste, door hinges, dimensions, and angle snapping.
- Export: SVG, PDF, DXF, glTF, and the `.grundriss` package.
- Assisted tracing with OpenCV.js, and a recognition model (U-Net, synthetic plans) in ONNX
  Runtime Web.
- Furniture: generic pieces, the Kenney kit, Poly Haven, and own glTF models.
- The whole building: stories, cellars, attics, stairs, chimneys, and north.
- Roofs on any outline with a setting for each side: gable, half hip, hip, shed, flat, dormers,
  roof windows, and the WoFlV living area under the roof.
- Utilities: water, heating, electricity, and communication, with devices, pipes, and cables.
- Energy: the envelope, the heat loss, the location, the climate of Open-Meteo, the heating per
  year (EN ISO 13790), the hot water, heated and unheated stories, and an hourly balance of
  electricity with PV and a battery.
- PV on the roof faces, and on racks on flat roofs.
- Renovation: variants with measures, an estimate of the cost, the subsidy, and the payback.
- Energy, second step: thermal bridges, ventilation with heat recovery, roof windows as windows,
  net and gross areas, a heat pump with a calculated performance, the heat pump readiness of each
  room, a summer check, and the shade on the PV.
- Renovation, second step: prices for Austria and Germany, interest and price changes in the
  payback, and an estimate of the German subsidy (BEG).
- Doors and windows with a way to open and one or two leaves, collision checks, editing in the
  3D view, and variants with their own floor plan.
- The website: a scroll story at the root of GitHub Pages, in English and in German, with the use
  cases. The app is at `/app/`.
- Topics, the Projects page with autosave in IndexedDB, and the app as an installable PWA.
- Data safety: a limit of the undo, smaller background images, a trash, a backup of all
  projects, warnings about the storage, and a lock against two tabs.
- A PDF report, the quantities as CSV, notes and photos on objects, circuits of electricity, and
  the help of the shortcuts.
- A layout for phones and tablets, with touch input, and a German interface.
- Browser tests with Playwright, and `src/main.ts` in modules of `src/ui/`.
- A self-hosted server (steps 2 and 3 below): tokens in the path (root, users, plan links),
  revisions with the parent check, the edit lease, live updates, server settings and users, share
  links with rights and end dates, copy and move between the browser and a server, and the
  Docker image with releases.

## Next: revisions and a self-hosted server

Today a plan goes to other people only as a file, and nothing stops two copies from going out of
sync. The first goal is not live editing, but this: a plan has one current state, each save
knows which state it starts from, and a save never overwrites the work of another person
without a message. The server is private and self-hosted; a public service comes later.

Each step is useful alone.

Step 1, the list of the revisions in the app, the copy of each connected plan for offline use, the
images stored once by their hash (`src/model/blobs.ts`), the removal of links that ended, the
list of all share links, `compose.yaml`, and a browser test against a real server
(`e2e/sharing.e2e.ts`) are done too. Edits without the network are still open.

### Step 1: revisions, without a server

- **A small header in the file.** A `.grundriss` file gets `revision`: an id, the id of the
  revision that it starts from (`parent`), the time of the save, and the name of the device. It
  is a new field that old versions ignore, so it needs no new `FILE_VERSION`. With it, each
  copy can find a conflict: "this file starts from revision 12, but the target has 14 now".
  The file holds only this header, not the history, because each revision of a plan with a
  background image is large.
- **A history in the browser.** IndexedDB keeps the revisions of each project next to its
  current state: one at each save to a file, and one every few minutes while the user edits.
  A "Versions" list of the project opens or restores an old revision. A limit (for example 50
  revisions or 200 MB) removes the oldest ones.
- **A check on save to a file.** If the file on the disk has another revision than the one that
  the app opened, the app does not overwrite it. It offers to load that version or to save the
  plan as a copy. This needs the File System Access API (Chrome and Edge).

### Step 2: the server

One program in TypeScript (Node), in this repository, from one container image. It uses the
code of the app to read and check a `.grundriss` file. It stores the tokens and the plans in one
JSON file and each revision in its own file on its disk; a private server has a few users and
some dozen plans, so it needs no database and no native module. SQLite can come when a server
needs more.

**The token is in the path.** Each token is a place on the server: `https://<server>/<token>/`
is the app with the access of that token, and `https://<server>/<token>/api/…` is its API. The
link is the access, so a person opens it like any address, and `curl` works without a header.
The API also takes `Authorization: Bearer <token>`, for scripts. A token is 128 random bits;
the server stores only its hash, and shows the token once, when it makes it. Root removes a
token, and its whole path is gone at once. A token can have an end date.

The path is in the access logs of the server and of a proxy, and in the history of the browser.
On a private server these are the logs of the owner. The server masks the tokens in its own log,
and sends `Referrer-Policy: no-referrer`, so that a link to another site does not send the path.

**Modes.** A setting chooses what the server does:

- `full`: it serves the build of the app under each valid token (`/<token>/`) and the API
  under `/<token>/api/`.
- `api`: it serves only the API (`/<token>/api/`). The app connects from another place (step 4).

In both modes, each request outside a valid token gets 404, also `/`, so the server shows
nothing to a scan.

**One kind of token, with a scope.** Each token opens the same app; only its scope differs. The
app asks `/<token>/api/me` for the scope, and shows what the token allows.

- **Root.** On the first start, the server makes the root token and prints it to the log once.
  Root sees and writes all plans, and makes and removes tokens. The app opens with the list of
  all plans.
- **User tokens.** Root makes a token for each person, with its settings: can the person make
  plans, does the person see only the own plans or all plans, and can the person write or only
  read. A plan that a user makes is visible only to that user and to root, until the user
  shares it. The app opens with the list of the plans that the token sees.
- **Plan tokens.** The owner of a plan (or root) makes a token for this one plan, to read or to
  write: this is the share link. The app opens the plan at once, without a list, and without the
  edit tools if the token only reads.

**Who makes tokens.** Only root and users that can write make tokens, and a token gets at most
the rights of its maker.

- Root makes user tokens and plan tokens with any rights and any end date.
- A user token that can write makes plan tokens for its own plans with its API: to read or to
  write; with an end date or a duration (for example 7 days), at most the end date of the user
  token; and with a label, for example "Bank" or "Architect".
- A user token makes other user tokens only if root allows it with a setting, for example for an
  office that invites its staff.
- A user token that only reads, and a plan token, make no tokens.
- A user lists and removes the tokens that it made; root lists and removes all of them. A removed
  token also removes the tokens that it made, so that no share link lives longer than the person
  who made it.

A plan has its own id, which is not a token. So one plan can have many plan tokens, for example
one to read for the bank and one to write for the architect, and each one ends or goes away
alone. The data: `tokens` (the hash, the kind, a label, the owner, the plan of a plan token, the
settings, the end date), `plans` (the id, the owner, the name, the current revision, the
lease), and `revisions` (the id, the plan, the parent, the time, the token that saved it, the
file).

**Revisions and the edit lease.**

- Each save sends the revision that it starts from. If another save came first, the server
  refuses the save (409), and the app offers to load the new version or to save a copy. So no
  save gets lost, also in rare cases.
- One client at a time edits a plan: it takes the edit lease of the plan for about 60 seconds,
  and renews it while its tab is open. The others see who edits, and read only. If the lease
  ends, for example because a laptop sleeps, another client can take it.
- The server keeps the revisions, so a user can go back to an old one. Large images go into
  the store once by their hash later, so that each revision does not copy them.

**The API** under `/<token>/api/`, about this size: the scope of the token (`me`); list the plans
that the token sees; make a plan; read the current revision; save a new revision with its parent;
list and read the revisions; take, renew, and give back the lease; make, list, and remove tokens
(root, and the owner of a plan for its plan tokens); and a stream of new revisions (server-sent
events), so that the readers see each save at once.

### The Docker image and the versions

The server goes out as a Docker image on the GitHub Container Registry
(`ghcr.io/andiwand/grundriss`), for `linux/amd64` and `linux/arm64`, so that it also runs on a
Raspberry Pi or a NAS. The image contains the server and the build of the app of the same
version, so the server always serves a matching app.

**The configuration** comes from environment variables, and the data from one volume:

- `GRUNDRISS_MODE`: `full` (app and API) or `api` (only the API).
- `GRUNDRISS_DATA`: the folder of the database and the revisions, a volume (default `/data`).
- `PORT`: the port (default 8080). The server speaks HTTP; a reverse proxy (Caddy, Traefik)
  adds https.
- `GRUNDRISS_ORIGINS`: the origins that may call the API (CORS), for example the PWA on GitHub
  Pages (step 4). Empty means only the same origin.
- `GRUNDRISS_ROOT_TOKEN`: an own root token, for example from a secret of the host. Without it,
  the server makes one on the first start and prints it to the log once.

So one command starts a server:
`docker run -v grundriss:/data -p 8080:8080 ghcr.io/andiwand/grundriss`. A `compose.yaml` in the
repository shows the same with a reverse proxy.

**The versions.** The project uses semantic versions, starting in 0.x, where a minor version can
change the API. One version is for all parts: `package.json`, the app (it shows it in the help),
the server, and the image.

- **A release** is a tag `vX.Y.Z` on `main`. A workflow then builds the image with the tags
  `X.Y.Z`, `X.Y`, and `latest`, and makes a GitHub release with the part of `CHANGELOG.md` for
  this version. The section `## Unreleased` becomes `## X.Y.Z – date`.
- **Each commit on `main`** also publishes an image, with the tags `main` and `sha-<commit>`, for
  people who want the newest state. `latest` stays the last release.
- **The API** has its version in the answer of `/<token>/api/me`. The app from GitHub Pages
  checks it and says if the server is too old or too new for it. The file format keeps its own
  `FILE_VERSION`.
- The first release with a version tag can be now, before the server, so that the app and the
  changelog get versions already.

### Step 3: connected projects in the app

- A project in IndexedDB is local, or connected: it then has the address of the token on the
  server (`https://<server>/<token>`), the id of the plan, and the last known revision. The
  Projects page shows both, with a mark on the connected ones.
- A connection is the address of a token. With a plan token, the app adds that plan. With a user
  token or root, it adds the server as a place with its list of plans, next to the plans of the
  browser. In mode `full`, the app reads the address from its own URL.
- The editor with the lease saves each change to the server, after a short wait, like the
  autosave today. The others get the new revisions from the stream and show them.
- The app keeps a copy of each connected plan in IndexedDB. Without the network, it opens the
  copy to read. Edits without the network can come later: the revision check then makes a copy
  if the server went on.
- The PWA: in mode `full`, the app installs from the path of a token. The scope of a service
  worker follows the path, so the installed app belongs to that token, with its own storage. For
  one person with one user token, that is the right thing. The service worker caches the app as
  today.

### Step 4: the public app connects to a private server

The normal PWA (on GitHub Pages) connects to a server in modes `full` and `api` too: the user
pastes the address of a token, or opens a link of the form
`…/grundriss/app/#connect=https://<server>/<token>`. GitHub Pages serves only its own files, so
the address goes in the fragment, which the browser does not send to any server. Because that
app runs on https, the browser lets it call the server only if the server has https and allows
the origin of the app (CORS, a setting of the server). Chrome also limits calls from public
sites to addresses in a local network. So the app that the server serves (mode `full`) is the
sure way, and the README explains the setup for the other way.

### Later

- **A public service.** We run the same server for all users, in the EU, with the business model
  below. A floor plan of a home is personal data (GDPR), so a user must be able to delete a plan,
  and the service needs a privacy policy.
- **Live editing.** All people edit at the same time, and their changes merge without loss with a
  CRDT (Yjs or Automerge). `PlanDocument` then keeps the building in the CRDT, undo stays per
  user, and the others show their selection. The lease of step 2 keeps it simple until people ask
  for this.
- **Accounts.** The tokens of step 2 are enough for a private server. A public service may need a
  login: a link by email with a library in our server (for example Better Auth), or an external
  service (Zitadel or Keycloak in the EU), never our own passwords.

## Business model

The app stays free and open source, with all features that work without a server. Money comes
only from the server: the hosting of plans and the collaboration.

- **A price for each shared plan.** One payment, for example for one renovation project with an
  architect and the craftsmen. This fits private users, who have one house and a project of
  some months. The plan stays online for a set time, or until the owner deletes it.
- **A subscription.** For energy consultants, architects, and planners with many plans and a
  team. A price for each seat and month.

Before we build the payment, GitHub Sponsors can show with no work if people pay at all.

**Enterprise** (self-hosting with a contract for support) is not a goal now. The possible
customers are energy consultancies, offices of architects, housing cooperatives, and public
bodies. Their sales take a long time, and a contract for support needs a reliability that one
person cannot give. The server stays easy to self-host, so we can decide this again when an
organization asks.

### Payment

A merchant of record sells to the customer in its own name. It handles the VAT of each
country, the invoices, the refunds, and the chargebacks. We get one payout and one invoice from
it. Examples: Paddle, Lemon Squeezy, and Polar.sh (made for open source). The fee is about 4 to
5 % and a small fixed amount for each sale; check the current prices.

The alternative is Stripe. Its fee is lower, but then we are the seller: we register for the
one-stop shop (OSS) of the EU VAT and send a VAT return each quarter. This is worth it only when
the revenue is large enough.

In both cases we need a registered business (in Austria a trade license), terms of service, a
privacy policy, and an Impressum. A tax adviser must check the setup once.

### License

Today the only author is the owner of the project, so the license can still change freely.
After the first outside contribution, a change needs the consent of each contributor. The
options:

- **MPL-2.0 for all, as today.** Simple, and friendly to contributors. But another company can
  run our server as a paid service and keep its changes private, if it puts the changes in new
  files.
- **AGPL-3.0 for the server, MPL-2.0 for the app.** A hosted service of the server must publish
  its changes. A commercial license for companies that do not accept the AGPL (a dual license)
  needs a contributor license agreement (CLA) for each outside contribution.
- **AGPL-3.0 for all.** The strongest protection, and still open source. But it can stop
  companies that want to use parts of the app in their own products.

Recommendation: the second option. Decide before the code of the server is public, or before
the first outside contribution.

## Native apps

The app already runs on phones, tablets, and desktops as a PWA. A native app adds a place in
the app stores, the file system of the device, and a better feeling of a "real" app.

Recommendation: keep one TypeScript code base, and put it in a native shell:

- **Desktop**: Tauri (the web view of the system, about 10 MB) or Electron (larger, but the same
  browser on each system).
- **iOS and Android**: Capacitor, with plugins for the files, the camera, and sharing.

All three use the existing code without change, so there is no duplicated code.

A rewrite in C++ (or Rust) is not a good way to remove duplication, because:

- No duplication exists today. One code base serves the browser, the PWA, and the shells above.
- A rewrite would replace Three.js, OpenCV.js, ONNX Runtime Web, the SVG editor, and the PDF and
  DXF export. That is all of the code, and the users get no new feature from it.
- A native interface needs a toolkit for each platform, or Qt. Qt in the browser (WASM) is large
  and slow to load, so the web app, which is the way most people find the app, would become
  worse.
- The server in TypeScript shares the model code with the app. A C++ app would need the file
  format two times, or a C++ server.

C++ or Rust compiled to WASM makes sense later for one slow part only, if a profile shows the
need (see the decisions). Then the same WASM module runs in the browser and in each shell.

## Ideas

- Sections and elevations: a cut along a line, and a view of each facade, with the heights.
- Automatic dimension chains, a title block in the PDF, and DXF layers by a standard.
- Existing and new state: walls to demolish and new walls, in red and yellow.
- IFC export for other building and energy programs.
- The heat loss to EN 12831 room by room: rooms of other temperatures, and the ground to
  EN ISO 13370.
- Better recognition: real scans and walls drawn as two thin lines in the training data.
- Photos of the notes in the PDF report.

## Known limits

The first versions of the milestones have these limits. Each one is a candidate for a later
step.

- **Roofs**: where two neighboring sides have different overhangs, a small step
  stays at their corner. In 3D, a dormer does not cut a hole in the main roof face. A flat roof
  ignores dormers and roof windows.
- **Attic and energy**: the clear height ignores the thickness of the roof. Where two roofs
  overlap on the plan, the overlap counts two times. The heat loss ignores the heat flow between
  rooms of different temperatures, and the ground has a flat factor. A slab counts to the ground or to an unheated story only under the label point of the
  room, so a room that sticks out past the story below loses nothing through that part.
- **Half hip**: dormers and roof windows go only on eave sides, not on the hip face of a half
  hip.
- **Electricity and renovation**: the household uses one usual day for all days, with more in
  winter. The performance of the heat pump is a part of the Carnot performance, not the data of
  a product. The battery has no losses at rest. The prices of the renovation are rough values for
  Austria and Germany, 2025, and the subsidy is only for Germany and without the bonuses for the
  income and the iSFP. A variant does not keep the own layers of single walls.
- **Summer**: each room is one node, so the peaks are lower than in a real room. The model has no
  heat flow between rooms and no shade of the eaves.
- **Shade**: the shade of the PV counts the roofs, the dormers, and the chimneys, but not trees,
  neighbors, walls, or the rows of other fields. The loss is linear in the lit area.
- **Languages**: the names of the Kenney models stay English. A plan stores the names of new
  stories and roofs in the language of the code (English), and the app translates them when it
  shows them. Some error messages with values stay English.
- **Collisions**: the check works on one story at a time and in the plan, with heights only for
  furniture against the leaves. It does not check furniture under a roof, devices, or lines. The
  app prevents only the overlap of openings on one wall; furniture can still go into a wall.
- **3D editing**: a drag moves objects; it does not turn them or change their size. A wall can be
  selected in 3D, but it moves only in 2D.
- **Variants**: a variant with its own floor plan keeps a full copy of its stories, with the notes
  and photos, so the file grows. All variants share the background images. The estimate of a
  floor plan does not know which walls carry a load; it only warns.
- **Furniture**: the app does not check furniture under a roof. A tall piece under the slope
  goes through the roof without a warning. A compound name without spaces ("gothicbed") can go
  to the wrong group of the catalog.
- **Recognition**: the model learned only from synthetic plans. It does not find walls that are
  drawn as two thin lines.
- **Climate**: the typical year is the mean of each hour of 10 years, so it has no cloudy or
  clear days, only mean days. The annual sums are right, but the transposition of mean hours can
  differ a little from real hours. The data comes from a reanalysis (ERA5) on a grid of about
  10 to 25 km, not from a station. The PV yield ignores snow and the spectrum. The design
  temperature (the coldest mean of 48 hours in 10 years) is not the value of a national annex to
  EN 12831.

## Decisions

- **TypeScript in the browser, no server.** A plan has a few hundred objects, so JavaScript is
  fast enough. The image processing uses libraries that are already WASM. Own WASM code comes
  only if a profile shows a need.
- **SVG for 2D.** It gives hit testing, crisp lines at each zoom, and a simple SVG export.
- **Three.js for 3D.** A wall is a set of boxes around its openings, so no CSG is necessary.
- **Snapshot undo.** The history keeps copies of the plan, not commands. That is simple and
  always correct for plans of this size.
- **The background image is in the file** as a data URL, so that a file contains everything.
