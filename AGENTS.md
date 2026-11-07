# AGENTS.md

Orientation for agents: what this is, the layout, the build loop, and the conventions. The
milestones are in [`PLAN.md`](PLAN.md). The user documentation is in [`README.md`](README.md).

## What this is

Grundriss is a browser app for floor plans. The user loads a scan or a photo of a plan, traces
the walls on it, and edits the plan in 2D. A 3D view shows the same plan. The app runs fully in
the browser and has no server. It reads and writes plans as JSON files.

## Architecture

One document model is the single source of truth. The 2D editor and the 3D view only show it.

- A `Building` has stories, roofs, and the north direction. A roof has its own outline and a
  `RoofSide` for each side; `roofshape.ts` makes its faces without the building. The outline is
  on the center lines of the walls; `roofInput` in `roof.ts` moves it out to the outer face of
  the walls, and the eaves go up to the floor of the story above. A `Story` is a `Plan` (the floor
  plan of one story) with an id, a name, an elevation, and a height. Stairs and chimneys belong
  to the story where they start. A stair goes up to the next story. A chimney goes up through
  the stories above.

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
  wall. So they move with the wall.
- Dimension lines (`Dimension`) have their own two points. They do not follow the walls.
- The selection of the editor is a list of `Item` (a kind and an id). The functions in
  `src/model/plan.ts` copy, paste, move, and remove items.
- Furniture belongs to a story. A piece is generic (a type of `src/model/furniture.ts`) or uses
  a `Model` of the building. A model has its GLB as a data URL, except the bundled Kenney
  models, which load from `public/models/kenney/`.
- Building services belong to a story: devices (`Fixture`) and lines (`Run`). The insulation is
  in `Building.envelope`, and a wall can override it with its own `layers`. PV fields
  (`Building.pv`) are on the faces of `roofSurfaces`. `energy.ts`, `pv.ts`, and
  `quantities.ts` calculate from the model and store nothing.
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

| Path                      | What                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `src/model/types.ts`      | The types of the plan.                                                                 |
| `src/model/geometry.ts`   | Vector and polygon functions.                                                          |
| `src/model/plan.ts`       | The operations on a plan: add, split, merge, and remove.                               |
| `src/model/building.ts`   | Stories, stairs, chimneys, and the frame of the roof.                                  |
| `src/model/roofshape.ts`  | The roof engine: a weighted straight skeleton, dormers, windows.                       |
| `src/model/roof.ts`       | The roofs of the building: inputs for the engine, a cache, lines, the roof over walls. |
| `src/model/rooms.ts`      | The rooms from the faces of the wall graph.                                            |
| `src/model/attic.ts`      | The rooms under a roof: ceiling, roof area, volume, walls, and the WoFlV living area.  |
| `src/model/history.ts`    | `PlanDocument`: transactions, undo, redo, and the dirty state.                         |
| `src/model/file.ts`       | The file format: `serializePlan` and `parsePlan` with validation.                      |
| `src/model/drawing.ts`    | The shapes of the 2D drawing, for the editor and the exports.                          |
| `src/io/files.ts`         | Open and save with the File System Access API, and the fallbacks.                      |
| `src/io/package.ts`       | The `.grundriss` package: a ZIP file with the plan and its image.                      |
| `src/export/`             | The exports: SVG, PDF, DXF, and glTF.                                                  |
| `src/model/services.ts`   | The devices and lines of electricity and heating, and symbols.                         |
| `src/model/insulation.ts` | The materials and the default envelope.                                                |
| `src/model/energy.ts`     | U-values and the heat loss of the rooms (an estimate).                                 |
| `src/model/pv.ts`         | The layout of PV panels on the roof, and the yield.                                    |
| `src/model/quantities.ts` | The lengths of the lines and the counts of the devices.                                |
| `src/model/furniture.ts`  | The generic furniture: sizes, plan symbols, 3D blocks, wall snap.                      |
| `src/furniture/`          | The model sources: Kenney, Poly Haven, and the import.                                 |
| `src/ui/catalog.ts`       | The furniture catalog.                                                                 |
| `src/view3d/models.ts`    | Loads 3D models and renders their images from above.                                   |
| `public/models/kenney/`   | The Kenney Furniture Kit as GLB files, with `catalog.json`.                            |
| `src/recognition/`        | Recognition: ONNX Runtime Web, tiles, and walls and openings.                          |
| `scripts/recognition/`    | The generator of synthetic plans, the training, and the export.                        |
| `scripts/`                | Tools that run by hand, for example the conversion of the kit.                         |
| `src/tracing/`            | Assisted tracing with OpenCV.js, which loads only when necessary.                      |
| `src/editor/editor2d.ts`  | The 2D editor: SVG drawing, tools, snapping, pan, and zoom.                            |
| `src/view3d/view3d.ts`    | The 3D view with Three.js.                                                             |
| `src/main.ts`             | The app: toolbar, panel, files, and keyboard shortcuts.                                |
| `src/icons.ts`            | The icons of the user interface.                                                       |
| `src/style.css`           | The layout and the style of the 2D drawing.                                            |
| `test/`                   | Vitest tests of the model. They run in Node and need no DOM.                           |
| `site/`                   | The website: a scroll story that builds one house with the engine of the app.          |
| `site/src/house.ts`       | The house of the website, made with the model functions. `test/site-house.test.ts`.    |
| `site/src/stage3d.ts`     | The 3D stage: parts of the house that grow with the scroll (a clipping plane).         |
| `site/src/plan2d.ts`      | The 2D pictures: a sketch like a scan, and the plan from the SVG export.               |
| `site/src/main.ts`        | The chapters, the scroll progress, the rail, and the live numbers of the cards.        |
| `docs/images/`            | The pictures of the README.                                                            |

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
npm run build         # type check, the website in dist/, and the app in dist/app/
npm run format:check
```

GitHub Pages serves `dist/`: the website at the root and the app at `/app/`. The workflow
`.github/workflows/pages.yml` checks, tests, builds, and deploys on `main`. The website imports
the engine of the app (`src/model`, `src/export`, `src/view3d`), so a change of the engine can
change the website. `test/site-house.test.ts` checks that its house stays valid.

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
