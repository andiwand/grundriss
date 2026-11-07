# Plan

## Milestones

1. **Manual tracing** (done in 0.1.0): load a scan as the background, set its scale, draw walls,
   doors, and windows, edit them, see the plan in 3D, and save it as a file.
2. **Better editing** (done): select more than one object, copy and paste, door hinge side and swing
   direction, dimension lines, angle snapping, and a wall that keeps its angle on a drag.
3. **Export** (done): SVG, PDF, and DXF for 2D, glTF for 3D, and the `.grundriss` package.
4. **Assisted tracing** (done, first version): OpenCV.js (WASM) corrects the perspective of a photo, removes noise,
   and suggests wall lines. The user accepts or corrects them.
5. **Furniture** (done): generic pieces, the Kenney kit, Poly Haven, and imported glTF models,
   with position, rotation, and size in the plan.
6. **The whole building** (done, first version): more than one story, a cellar and an attic as stories, stairs that
   connect two stories, a roof (gable, hip, flat, and shed), chimneys, and the orientation of
   the plan to north. The 3D view stacks the stories. This milestone changes the file format.
   Later: several roofs on any outline, with settings for each side, dormers, and roof
   windows (done). The half-hip end is still open.
7. **Building services** (done, first version): layers on the plan for photovoltaic panels on the roof, heating
   (radiators, floor heating, and the heat source), the insulation of walls, roof, and floor,
   and the electrical wiring (sockets, switches, lights, and cables). Each layer can be on or
   off in the 2D and in the 3D view.
8. **Energy efficiency**: first, the location of the building: a place search or coordinates.
   A button loads the climate once and stores it in the plan, so that the app works offline
   after that: the PV yield of each roof face from PVGIS, and the monthly temperatures, the
   heating degree days, and the design temperature from Open-Meteo (free for non-commercial
   use, CC BY 4.0). The location goes to these services only when the user clicks the button.
   Then a model of the yearly energy for heating. It starts from the heat loss
   of milestone 7: the U-values of the walls, the windows, the doors, the roof, and the floor
   or the cellar ceiling, and the ventilation. It adds the climate (degree days or monthly
   temperatures), the solar and internal gains, and the heating technology: a gas or oil
   boiler with its efficiency, a heat pump with its seasonal performance factor, district
   heating, or wood, and the losses of the distribution. A heated cellar and an unheated cellar
   count differently. The result is the heat demand and the final energy in kWh per year and
   per m², the CO₂, the cost, and an efficiency class. The app compares variants, for example
   "more insulation on the roof" against "a heat pump", and shows how much PV of milestone 7
   covers. The model is an estimate in the spirit of EN ISO 13790 and DIN V 18599, not an
   official energy certificate.
9. **Automatic recognition** (done, first version: a U-Net trained only on synthetic plans): a segmentation model for floor plans in ONNX Runtime Web. This is
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
