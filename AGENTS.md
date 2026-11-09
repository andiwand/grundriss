# AGENTS.md

Orientation for agents: what this is, the layout, the build loop, and the conventions. The
milestones are in [`PLAN.md`](PLAN.md). The user documentation is in [`README.md`](README.md).

## What this is

Grundriss is a browser app for floor plans. The user loads a scan or a photo of a plan, traces
the walls on it, and edits the plan in 2D. A 3D view shows the same plan. The app runs fully in
the browser for local plans. An optional self-hosted server stores shared plans and revisions.
The app also reads and writes plans as JSON files.

## Architecture

One document model is the single source of truth. The 2D editor and the 3D view only show it.

- A `Building` has stories, roofs, and the north direction. A roof has its own outline and a
  `RoofSide` for each side; `roofshape.ts` makes its faces without the building. The outline is
  on the center lines of the walls; `roofInput` in `roof.ts` moves it out to the outer face of
  the walls, and the eaves go up to the floor of the story above. A `Story` is a `Plan` (the floor
  plan of one story) with an id, a name, an elevation, and a height. Stairs and chimneys belong
  to the story where they start. A stair goes up to the next story. A chimney goes up through
  the stories above.

- Without an open plan (`planOpen` in `src/main.ts`), the app shows the home page (`#home`) with
  the projects, and the top bar hides the parts with the class `plan-tools`. With an open plan,
  the user interface has six topics (`Topic`): overview, structure, utilities, interior, energy,
  and renovation. Energy and renovation have a wide panel (`body.wide`). A topic selects the tools of the palette (`data-topic`), the panel without a
  selection, and the layers. The overview (`#overview`) shows the contents in place of the 2D
  and the 3D view. The topic is not in the plan file.
- `src/main.ts` is the shell: the topics, the tools, the views, the files, the menus, the
  keyboard, and the wiring. The panel of each topic is a module in `src/ui/`. They share
  `src/ui/context.ts`: `doc`, `editor`, `view3d`, the state of the app (`app`), and `shell`, the
  functions of `main.ts` that the panel modules call. `main.ts` sets `shell` at the start, so
  the modules do not import `main.ts`. `cached(key, fn)` keeps a calculation until the document
  changes, because the panel calls the same calculations more than once.
- The texts of the user interface go through `t()` of `src/i18n/index.ts`: the English text is
  the key, and `src/i18n/de/` has the German texts. `translatePage` translates the static texts
  of `index.html` at the start. Numbers in texts use `fmt` of `src/model/format.ts`, so German
  gets the decimal comma. `src/model/` does not import `src/i18n/`; the UI translates the names
  of the model (`t(type.name)`) where it shows them.
- In a narrow window (`src/ui/compact.ts`), the app uses the layout for a phone: the class
  `compact` on the body, the topics in `#bottom-bar`, and the panel as a sheet.
- A plan can also be on a Grundriss server (`server/`, `src/ui/remote.ts`). Each address of the
  server starts with a token (`/<token>/` for the app, `/<token>/api/` for the API), and the
  token is the access: root, a user, or one plan. A token makes only tokens with at most its
  rights. An open plan of a server saves to it after each change, if the tab has the edit
  lease; else `doc.readOnly` keeps it from changes, and the stream of the server updates it. A
  save names its parent revision, so the server refuses a save on an old revision (409). The
  server reads the plans with the code of `src/model/`, and esbuild bundles it into one file.
- The open plan saves itself in IndexedDB (`src/io/projects.ts`) after each change. Each
  project stores the JSON of the file format, so `parseBuilding` reads it, with its migrations.
- The app is a PWA: `public/manifest.webmanifest` and the service worker `src/pwa/sw.js`. The
  plugin in `vite.config.ts` writes the service worker into the build with a new version and the
  list of the files to cache. The dev server has no service worker.
- `PlanDocument` (`src/model/history.ts`) holds the building, the active story, and the undo
  history. `doc.plan` is the active story. `doc.edit` changes the active story, and
  `doc.editBuilding` changes the building. The choice of the active story is not in the history.
- Each change goes through a transaction: `doc.edit(fn)` for one change, or `doc.begin()`,
  `doc.update(fn)`, and `doc.commit()` for a drag. The history keeps snapshots of the plan, so
  an undo is always correct. A transaction copies the plan, so do not keep a reference to an
  object of the plan across transactions. Find the object again by its id.
- Walls are a graph: vertices are corners, and walls are edges between two vertices. Walls meet
  only at vertices. The editor splits a wall where a new wall starts or ends on it.
- Doors and windows (`Opening`) belong to a wall, with an offset from the vertex `a` of the
  wall. So they move with the wall. `style` (hinged, sliding, fixed) and `leaves` say how they
  open; `openingShape` in `drawing.ts` gives the symbol for the editor, the exports, and the 3D
  view. `openings.ts` keeps an opening in the free part of its wall and out of the others
  (`freeOffset`); the editor and the 3D view use it for each placement and move.
- `conflicts.ts` finds objects that collide on one story. The 2D editor marks them, and
  `src/ui/conflicts.ts` lists them in the panel.
- The 3D view only reads the building. Its meshes have `userData.item` and their story group
  `userData.storyId`; `View3D.pickAt` finds the object under the pointer, and `View3D.edit`
  (set by `src/ui/edit3d.ts`) gets the clicks and the drags and changes the document.
- Dimension lines (`Dimension`) have their own two points. They do not follow the walls.
- The selection of the editor is a list of `Item` (a kind and an id). The functions in
  `src/model/plan.ts` copy, paste, move, and remove items.
- Furniture belongs to a story. A piece is generic (a type of `src/model/furniture.ts`) or uses
  a `Model` of the building. A model has its GLB as a data URL, except the bundled Kenney
  models, which load from `public/models/kenney/`.
- Building services belong to a story: devices (`Fixture`) and lines (`Run`). Each one has a system:
  water, heating, electric, or comms. `parsePlan` takes the system from the known type or kind. The insulation is
  in `Building.envelope`, and a wall can override it with its own `layers`. A story can be
  unheated (`Story.heated`); `energy.ts` then uses `Envelope.ceiling` for the slab to it.
  `Building.variants` are copies of the envelope, the heated stories, the household, the PV,
  and, if the user changes it, the floor plan (`Variant.layout`: copies of the stories and the
  roofs). Backgrounds follow the story id across layouts, including stories absent from the
  open layout. `variants.ts` makes variants and calculates on a copy of the
  building. One variant can be open (`Building.variant`): the building then shows it, all
  topics edit it, and `Building.base` keeps the plan. `switchVariant` saves the open state into
  its variant. Code that compares with the plan uses `planBuilding`, not `doc.building`. A file
  has the plan in the building and the open variant in its variant (`serializeBuilding`), so an
  old app reads the plan. PV fields
  (`Building.pv`) are on the faces of `roofSurfaces`. `energy.ts`, `pv.ts`, and
  `quantities.ts` calculate from the model and store nothing.
- `Building.location` is the place of the building, and `Building.climate` is a typical year of
  hourly radiation and temperature for it. The app downloads the climate once, only when the user
  clicks "Load climate", and stores it in the plan as compact series (`encodeSeries` in
  `climate.ts`). `climate.ts` keeps the decoded series and the results of each face in a cache,
  because a transaction copies the building. `pv.ts` uses the climate when the building has one.
- The ceiling of a room is the roof where the roof is lower than the room. `clearHeight` in
  `roof.ts` gives the clear height under the roofs that cover a story, with dormers. A story
  inside a pitched roof, or on its own pitched roof on walls lower than 2 m, has no flat ceiling
  (`roofIsCeiling` in `attic.ts`). `attic.ts` clips the room by the plane parts of the roof
  (`roofPatches`), so its areas and volumes are exact. `energy.ts` and the WoFlV area use it.
- Rooms are not stored. `findRooms` calculates them from the cycles of the wall graph. The data
  that the user gives to a room (`RoomInfo`: a name and a height) has the key of the room (its
  vertex ids) and a point inside it. `normalize` updates both after each change, so the data
  follows the room.
- The plan uses meters and screen axes (y points down). The 3D view maps the plan y to the
  world z.

## Layout

| Path                       | What                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `src/model/types.ts`       | The types of the plan.                                                                   |
| `src/model/geometry.ts`    | Vector and polygon functions.                                                            |
| `src/model/plan.ts`        | The operations on a plan: add, split, merge, and remove.                                 |
| `src/model/building.ts`    | Stories, stairs, chimneys, and the frame of the roof.                                    |
| `src/model/roofshape.ts`   | The roof engine: a weighted straight skeleton, dormers, windows.                         |
| `src/model/roof.ts`        | The roofs of the building: inputs for the engine, a cache, lines, the roof over walls.   |
| `src/model/rooms.ts`       | The rooms from the faces of the wall graph.                                              |
| `src/model/example.ts`     | The example house of the start card and the website. `test/example.test.ts`.             |
| `src/model/attic.ts`       | The rooms under a roof: ceiling, roof area, volume, walls, and the WoFlV living area.    |
| `src/model/history.ts`     | `PlanDocument`: transactions, undo, redo, and the dirty state.                           |
| `src/model/file.ts`        | The file format: `serializePlan` and `parsePlan` with validation.                        |
| `src/model/drawing.ts`     | The shapes of the 2D drawing, for the editor and the exports.                            |
| `src/io/files.ts`          | Open and save with the File System Access API, and the fallbacks.                        |
| `src/io/projects.ts`       | The projects in the browser: IndexedDB, the list, and persistent storage.                |
| `src/pwa/sw.js`            | The service worker: the cache of the app for offline use and the install.                |
| `src/io/package.ts`        | The `.grundriss` package: a ZIP file with the plan and its image.                        |
| `src/export/`              | The exports: SVG, PDF, DXF, and glTF.                                                    |
| `src/export/preview.ts`    | The picture of a plan on the Projects page. The server uses it for its list of plans.    |
| `src/model/services.ts`    | The devices and lines of electricity and heating, and symbols.                           |
| `src/model/insulation.ts`  | The materials and the default envelope.                                                  |
| `src/model/energy.ts`      | U-values and the heat loss of the rooms (an estimate).                                   |
| `src/model/pv.ts`          | The layout of PV panels on the roof, racks on flat roofs, and the yield.                 |
| `src/model/climate.ts`     | The stored climate: the series, the sun position, the irradiance on faces, PV, HDD.      |
| `src/model/colors.ts`      | The colors of the wall sides (own, room, or facade) and the defaults of the colors.      |
| `src/model/walljoin.ts`    | The ends of the two faces of a wall at its joins: flush, miter, or T.                    |
| `src/model/heating.ts`     | The heating per year: a monthly balance, the heating system, hot water, cost, CO₂.       |
| `src/model/variants.ts`    | The variants: the measures, the open variant, apply, and the comparison with the plan.   |
| `src/model/layout.ts`      | The changes of the floor plan of a variant: walls to remove and to build, new openings.  |
| `src/model/openings.ts`    | The place of a door or a window: the free part of its wall, and the side of the room.    |
| `src/model/conflicts.ts`   | The collisions of openings, furniture, walls, stairs, and chimneys on one story.         |
| `src/model/balance.ts`     | The hourly balance of electricity: household, heating, PV, battery, and the cost.        |
| `src/model/renovation.ts`  | The cost of a variant, its saving per year, and its payback time.                        |
| `src/io/climate.ts`        | The place search and the climate download from Open-Meteo, and the typical year.         |
| `src/io/tiles.ts`          | The map under the 2D plan: the tile sources and the Web Mercator math.                   |
| `src/model/quantities.ts`  | The lengths of the lines and the counts of the devices.                                  |
| `src/model/furniture.ts`   | The generic furniture: sizes, plan symbols, 3D blocks, wall snap.                        |
| `src/furniture/`           | The model sources: Kenney, Poly Haven, and the import.                                   |
| `src/ui/catalog.ts`        | The furniture catalog.                                                                   |
| `src/view3d/models.ts`     | Loads 3D models and renders their images from above.                                     |
| `public/models/kenney/`    | The Kenney Furniture Kit as GLB files, with `catalog.json`.                              |
| `src/recognition/`         | Recognition: ONNX Runtime Web, tiles, and walls and openings.                            |
| `scripts/recognition/`     | The generator of synthetic plans, the training, and the export.                          |
| `scripts/`                 | Tools that run by hand, for example the conversion of the kit.                           |
| `src/tracing/`             | Assisted tracing with OpenCV.js, which loads only when necessary.                        |
| `src/editor/editor2d.ts`   | The 2D editor: SVG drawing, tools, snapping, pan, and zoom.                              |
| `src/view3d/view3d.ts`     | The 3D view with Three.js.                                                               |
| `src/main.ts`              | The shell: topics, tools, views, files, menus, keyboard, and wiring.                     |
| `src/ui/context.ts`        | The shared objects of the UI: the document, the editor, `app`, `shell`, `cached`.        |
| `src/ui/panel.ts`          | The helpers of the panel: headings, fields, stats, tables, groups.                       |
| `src/ui/selection.ts`      | The panel of the selected objects.                                                       |
| `src/ui/structure.ts`      | Background, stories, building, and roofs.                                                |
| `src/ui/utilities.ts`      | The utilities, the PV fields, and the distribution board.                                |
| `src/ui/energy.ts`         | Location, climate, envelope, heating, readiness, summer, and the balance.                |
| `src/ui/renovation.ts`     | The variants with their measures, cost, subsidy, and payback.                            |
| `src/ui/projects.ts`       | The Projects page, the autosave, the trash, the backup, and the lock of a project.       |
| `src/ui/contents.ts`       | The tree of the Overview.                                                                |
| `src/ui/tracing.ts`        | The assisted tracing of a background.                                                    |
| `src/model/blobs.ts`       | The large data URLs of a plan, stored once by hash in the stores of the revisions.       |
| `src/io/file-revision.ts`  | The check of the revision of a file before the app replaces it.                          |
| `e2e/sharing.e2e.ts`       | The browser test with a real server (Playwright starts it, see `playwright.config.ts`).  |
| `compose.yaml`             | The server with Caddy for https, for self-hosting.                                       |
| `src/ui/versions.ts`       | The versions of a plan: the history in the browser, or the revisions on a server.        |
| `src/ui/dialog.ts`         | The helpers of the dialogs of the app.                                                   |
| `src/ui/remote.ts`         | The plans on a server: connections, the session of a plan, share, users, copy and move.  |
| `src/io/server.ts`         | The client of the API of the server.                                                     |
| `server/`                  | The server: `src/store.ts` (tokens, plans, revisions), `src/app.ts` (HTTP), the tests.   |
| `Dockerfile`               | The image of the server with the website and the app. `.github/workflows/image.yml`.     |
| `src/ui/conflicts.ts`      | The list of the collisions in the panel.                                                 |
| `src/ui/edit3d.ts`         | The editing in the 3D view: select, hover, and move.                                     |
| `src/ui/notes.ts`          | The notes and photos of the objects, and the circuit field.                              |
| `src/ui/compact.ts`        | The layout for a phone: the bar at the bottom, the sheet, and the Done button.           |
| `src/ui/shortcuts.ts`      | The help of the keyboard shortcuts.                                                      |
| `src/i18n/`                | The languages: `t()`, the German dictionary, and the translation of the page.            |
| `src/model/format.ts`      | The format of the numbers in the language of the app.                                    |
| `src/model/radiators.ts`   | The heat pump readiness: the flow temperature that the radiators of each room need.      |
| `src/model/overheating.ts` | The summer check of each room.                                                           |
| `src/model/shade.ts`       | The shade of the roofs, the dormers, and the chimneys on the PV fields.                  |
| `src/model/takeoff.ts`     | The quantities: rooms, openings, the areas of the envelope, and materials.               |
| `src/export/report.ts`     | The report as a PDF.                                                                     |
| `src/export/csv.ts`        | The quantities as CSV files in a ZIP file.                                               |
| `src/io/backup.ts`         | The backup of all projects as a ZIP file.                                                |
| `e2e/`                     | The browser tests with Playwright.                                                       |
| `src/icons.ts`             | The icons of the user interface.                                                         |
| `src/style.css`            | The layout and the style of the 2D drawing.                                              |
| `test/`                    | Vitest tests of the model. They run in Node and need no DOM.                             |
| `site/`                    | The website: a scroll story that builds one house with the engine of the app.            |
| `site/src/stage3d.ts`      | The 3D stage: parts of the house that grow with the scroll (a clipping plane).           |
| `site/src/plan2d.ts`       | The 2D pictures: a sketch like a scan, and the plan from the SVG export.                 |
| `site/src/main.ts`         | The chapters, the scroll progress, the rail, and the live numbers of the cards.          |
| `site/src/i18n.ts`         | The texts of the website in English and German. A new text goes into both languages.     |
| `site/src/page.ts`         | The page of the website: a plugin of `vite.site.config.ts` renders it for each language. |
| `docs/images/`             | The pictures of the README.                                                              |

`src/recognition/contract.ts` is the contract between the training and the app: the names,
the shapes, the classes, and the scale of the input. A change of it needs a new model.

`src/model/` must not import from the DOM or from Three.js, so that the tests can run in Node
and the code can move to a worker or to WASM later.

## Build and test

```sh
npm ci
npm run dev           # serves the app on http://localhost:5173
npm run dev:site      # serves the website (vite.site.config.ts)
npm test
npm run test:e2e      # browser tests: builds the app, and runs e2e/ in Chromium (desktop and phone)
npm run build         # type check, the website in dist/, and the app in dist/app/
npm run server        # builds the server, and starts it with the app of dist/app/ (data in server/data)
npm run format:check
```

GitHub Pages serves `dist/`: the website at the root and the app at `/app/`. The workflow
`.github/workflows/pages.yml` checks, tests, builds, and deploys on `main`. The website imports
the engine of the app (`src/model`, `src/export`, `src/view3d`), so a change of the engine can
change the website. `test/example.test.ts` checks that the example house stays valid.

## Conventions

- Format before each commit: `npm run format`.
- Commit messages follow Conventional Commits, for example `feat(editor): ...`,
  `fix(model): ...`, `docs: ...`.
- A change that a user notices gets an entry under `## Unreleased` in `CHANGELOG.md`.
- A change of the file format that old versions cannot read needs a new `FILE_VERSION` and a
  migration in `parsePlan`. Add a test with a file of the old version.
- Commit messages, code comments, and documentation use Simplified Technical English: one idea
  per sentence, the active voice, the present tense, one word for one meaning, and short common
  words. Identifiers and error strings stay as they are.
