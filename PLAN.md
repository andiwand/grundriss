# Plan

## Milestones

1. **Manual tracing** (done in 0.1.0): load a scan as the background, set its scale, draw walls,
   doors, and windows, edit them, see the plan in 3D, and save it as a file.
2. **Better editing** (done): select more than one object, copy and paste, door hinge side and swing
   direction, dimension lines, angle snapping, and a wall that keeps its angle on a drag.
3. **Export** (done): SVG, PDF, and DXF for 2D, glTF for 3D, and the `.grundriss` package.
4. **Assisted tracing** (done, first version): OpenCV.js (WASM) corrects the perspective of a photo, removes noise,
   and suggests wall lines. The user accepts or corrects them.
5. **Furniture**: a catalog of glTF models, with position and rotation in the plan.
6. **The whole building**: more than one story, a cellar and an attic as stories, stairs that
   connect two stories, a roof (gable, hip, flat, and shed), chimneys, and the orientation of
   the plan to north. The 3D view stacks the stories. This milestone changes the file format.
7. **Building services**: layers on the plan for photovoltaic panels on the roof, heating
   (radiators, floor heating, and the heat source), the insulation of walls, roof, and floor,
   and the electrical wiring (sockets, switches, lights, and cables). Each layer can be on or
   off in the 2D and in the 3D view.
8. **Automatic recognition**: a segmentation model for floor plans in ONNX Runtime Web. This is
   research work, and it must not block the other milestones.

## Decisions

- **TypeScript in the browser, no server.** A plan has a few hundred objects, so JavaScript is
  fast enough. The image processing uses libraries that are already WASM. Own WASM code comes
  only if a profile shows a need.
- **SVG for 2D.** It gives hit testing, crisp lines at each zoom, and a simple SVG export.
- **Three.js for 3D.** A wall is a set of boxes around its openings, so no CSG is necessary.
- **Snapshot undo.** The history keeps copies of the plan, not commands. That is simple and
  always correct for plans of this size.
- **The background image is in the file** as a data URL, so that a file contains everything.
