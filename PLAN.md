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
- The website: a scroll story at the root of GitHub Pages, in English and in German, with the use
  cases. The app is at `/app/`.
- Topics, the Projects page with autosave in IndexedDB, and the app as an installable PWA.
- Data safety: a limit of the undo, smaller background images, a trash, a backup of all
  projects, warnings about the storage, and a lock against two tabs.
- A PDF report, the quantities as CSV, notes and photos on objects, circuits of electricity, and
  the help of the shortcuts.
- A layout for phones and tablets, with touch input, and a German interface.
- Browser tests with Playwright, and `src/main.ts` in modules of `src/ui/`.

## Next: collaboration with a server

Today the app has no server, and a plan goes to other people only as a file. Live work together
needs a server, because two browsers cannot find each other on the internet without one. Even a
direct connection between browsers (WebRTC) needs a server to start the connection, and often a
relay server for networks that block it.

The goal: a user uploads a plan, and gets a link. Other people open the link and see the plan.
With the right to edit, they change it at the same time, and each one sees the changes of the
others live.

Steps, each one useful alone:

1. **Share a copy.** Upload a `.grundriss` package and get a link to a read-only copy. The
   server stores files only. A link can also hold a small plan without a server, compressed in
   the URL, but the background image and the models are too large for it.
2. **Live view.** The owner edits, and the others see each change at once. The server sends the
   changes of a project to all its viewers (WebSocket).
3. **Live editing.** All people can edit. Two changes at the same time must merge without loss.
   A CRDT does this: Yjs or Automerge. `PlanDocument` then keeps the building in the CRDT, and
   each transaction becomes one change of the CRDT. Undo stays per user, so that an undo does
   not take back the change of another user. The others show their selection and their pointer.
4. **Accounts and rights.** Owners, editors, and viewers. Links that expire.

Questions to decide:

- **Hosting.** An own small server (Node with `y-websocket`, files in object storage), or a
  service, for example Cloudflare Durable Objects, PartyKit, or Liveblocks. The app on GitHub
  Pages stays as it is; the server is only for the shared projects.
- **Privacy.** A floor plan of a home is personal data (GDPR). The server must be in the EU, and
  a user must be able to delete a project. End-to-end encryption with the key in the link is
  possible for steps 1 and 2.
- **Offline first.** The app must work as before without the server. A shared project keeps a
  copy in IndexedDB, and the changes go to the server when the network is back. A CRDT supports
  this.
- **Large data.** The background image and the models go to a store for files, not into the
  live document.

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
