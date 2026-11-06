# AGENTS.md

Orientation for agents: what this is, the layout, the build loop, and the conventions. The
milestones are in [`PLAN.md`](PLAN.md). The user documentation is in [`README.md`](README.md).

## What this is

Grundriss is a browser app for floor plans. The user loads a scan or a photo of a plan, traces
the walls on it, and edits the plan in 2D. A 3D view shows the same plan. The app runs fully in
the browser and has no server. It reads and writes plans as JSON files.

## Architecture

One document model is the single source of truth. The 2D editor and the 3D view only show it.

- `PlanDocument` (`src/model/history.ts`) holds the plan and the undo history.
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
- Rooms are not stored. `findRooms` calculates them from the cycles of the wall graph.
- The plan uses meters and screen axes (y points down). The 3D view maps the plan y to the
  world z.

## Layout

| Path                     | What                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `src/model/types.ts`     | The types of the plan.                                            |
| `src/model/geometry.ts`  | Vector and polygon functions.                                     |
| `src/model/plan.ts`      | The operations on a plan: add, split, merge, and remove.          |
| `src/model/rooms.ts`     | The rooms from the faces of the wall graph.                       |
| `src/model/history.ts`   | `PlanDocument`: transactions, undo, redo, and the dirty state.    |
| `src/model/file.ts`      | The file format: `serializePlan` and `parsePlan` with validation. |
| `src/model/drawing.ts`   | The shapes of the 2D drawing, for the editor and the exports.     |
| `src/io/files.ts`        | Open and save with the File System Access API, and the fallbacks. |
| `src/io/package.ts`      | The `.grundriss` package: a ZIP file with the plan and its image. |
| `src/export/`            | The exports: SVG, PDF, DXF, and glTF.                             |
| `src/tracing/`           | Assisted tracing with OpenCV.js, which loads only when necessary. |
| `src/editor/editor2d.ts` | The 2D editor: SVG drawing, tools, snapping, pan, and zoom.       |
| `src/view3d/view3d.ts`   | The 3D view with Three.js.                                        |
| `src/main.ts`            | The app: toolbar, panel, files, and keyboard shortcuts.           |
| `src/icons.ts`           | The icons of the user interface.                                  |
| `src/style.css`          | The layout and the style of the 2D drawing.                       |
| `test/`                  | Vitest tests of the model. They run in Node and need no DOM.      |

`src/model/` must not import from the DOM or from Three.js, so that the tests can run in Node
and the code can move to a worker or to WASM later.

## Build and test

```sh
npm ci
npm run dev           # serves the app on http://localhost:5173
npm test
npm run build         # type check and production build in dist/
npm run format:check
```

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
