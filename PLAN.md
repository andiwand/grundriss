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
   windows (done), attics under the roof with the WoFlV living area (done), and the half-hip
   end (done).
7. **Building services** (done, first version): layers on the plan for photovoltaic panels on the roof, heating
   (radiators, floor heating, and the heat source), the insulation of walls, roof, and floor,
   and the electrical wiring (sockets, switches, lights, and cables). Each layer can be on or
   off in the 2D and in the 3D view.
8. **Energy efficiency** (done: the location, the climate, the heating per year as a monthly
   balance with the heating system, cost, CO₂, a class, and the PV share, the hot water, heated
   and unheated stories, and the comparison of variants): first, the location of the building: a place search (Open-Meteo
   geocoding) or coordinates. A button loads the climate once and stores it in the plan, so that
   the app works offline after that: a typical year of hourly radiation (global, direct, and
   diffuse) and temperature from the Open-Meteo archive (CC BY 4.0, free for non-commercial use).
   The location goes to the service only when the user clicks the button. PVGIS sends no CORS
   header, so a browser app cannot call it; the app computes the irradiance on each roof face
   itself (sun position and a transposition model) from the stored radiation. From the stored
   year come the PV yield of each face, the monthly temperatures, the heating degree days, and
   the design temperature.
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
10. **Website** (done): a scroll story at the root of GitHub Pages that builds one house with the
    engine of the app. The app is at `/app/`.
11. **Topics and projects** (done): the user interface in five topics (overview, structure,
    utilities, interior, and energy), water and communication as systems of the utilities, a
    Projects page with the plans in the browser (IndexedDB) and autosave, and the app as a PWA
    that the user can install and use offline.

## Known limits

The first versions of the milestones have these limits. Each one is a candidate for a later
step.

- **Roofs**: no half-hip end. Where two neighboring sides have different overhangs, a small step
  stays at their corner. In 3D, a dormer does not cut a hole in the main roof face. A flat roof
  ignores dormers and roof windows.
- **Attic and energy**: the clear height ignores the thickness of the roof. Where two roofs
  overlap on the plan, the overlap counts two times. Roof windows count as roof area, not as
  windows. A slab counts to the ground or to an unheated story only under the label point of the
  room, so a room that sticks out past the story below loses nothing through that part. A
  variant does not keep the own layers of single walls.
- **Half hip**: dormers and roof windows go only on eave sides, not on the hip face of a half
  hip.
- **Furniture**: the app does not check furniture under a roof. A tall piece under the slope
  goes through the roof without a warning. A compound name without spaces ("gothicbed") can go
  to the wrong group of the catalog.
- **Recognition**: the model learned only from synthetic plans. It does not find walls that are
  drawn as two thin lines.
- **Climate**: the typical year is the mean of each hour of 10 years, so it has no cloudy or
  clear days, only mean days. The annual sums are right, but the transposition of mean hours can
  differ a little from real hours. The data comes from a reanalysis (ERA5) on a grid of about
  10 to 25 km, not from a station. The PV yield ignores shade, snow, and the spectrum. The design
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
