<p align="center">
  <img src="public/icon.svg" alt="Grundriss logo" width="96" height="96" />
</p>

<h1 align="center">Grundriss</h1>

<p align="center">
  <strong>From a sketch to a house you can walk around.</strong><br />
  Trace a scanned floor plan, edit it in 2D, and see it in 3D – in your browser.
</p>

<p align="center">
  <a href="https://andiwand.github.io/grundriss/app/"><strong>Open the app</strong></a> ·
  <a href="https://andiwand.github.io/grundriss/">Website</a> ·
  <a href="#use">Use</a> ·
  <a href="AGENTS.md">Develop</a>
</p>

<p align="center">
  <img src="docs/images/app.jpg" alt="The app: the plan of a house in 2D and the same house in 3D" width="900" />
</p>

_Grundriss_ is the German word for a floor plan. The app runs fully in your browser. It needs no
account and no server, and your plans stay on your computer as files.

## Features

| Part          | What it does                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trace**     | Load a scan or a photo of a plan. A neural network finds the walls, the doors, and the windows in the browser. OpenCV straightens and cleans the image.           |
| **Draw**      | Walls with snapping and angles, doors and windows, dimensions, and rooms that close by themselves with their names and areas.                                     |
| **3D**        | The 3D view shows the plan at the same time as you edit it, with holes for each door and window.                                                                  |
| **Stories**   | Cellars, floors, and attics. Straight, L, and U stairs, and chimneys through all stories.                                                                         |
| **Roofs**     | Gable, hip, shed, flat, or each side on its own, on any outline. Dormers and roof windows. The attic walls stop at the roof, and the attic shows its living area. |
| **Furniture** | Generic pieces, the Kenney Furniture Kit, models from Poly Haven, and your own glTF files.                                                                        |
| **Services**  | Sockets, switches, lights, radiators, and heat sources, with cables and pipes and their lengths.                                                                  |
| **Energy**    | The layers of the envelope, U-values, the heat loss of each room, the climate of the location, and solar panels with their yield.                                 |
| **Export**    | PDF at 1:50 or 1:100, SVG, DXF, glTF, and one `.grundriss` package with everything.                                                                               |

<p align="center">
  <a href="https://andiwand.github.io/grundriss/">
    <img src="docs/images/website.jpg" alt="The website of Grundriss" width="900" />
  </a>
</p>

## Use

1. Click **Background** and choose a scan or a photo of a plan.
2. Optional: straighten and clean the image, and let the app suggest the walls. See
   [Assisted tracing](#assisted-tracing).
3. Click two points with a known distance between them, for example the ends of a wall. Type
   the real length and click **Apply**.
4. Select the **Wall** tool and click the corners of the walls. A click on a corner or on a wall
   ends the chain.
5. Select **Door** or **Window** and click on a wall. A door opens to the side of the wall where
   you click. The panel can flip the hinge and the swing of a door.
6. Select **Measure** to add a dimension line: click the two ends, then click where the line goes.
7. With **Select**, click or drag a box to select objects, and drag them to move them. When you
   drag one wall, the next walls keep their angles. The panel on the right shows the values of
   the selection.
8. Use the list at the bottom left to add a story, an attic, or a cellar, and to switch between
   the stories. The walls of the story below show as dashed lines, so you can draw on top of
   them. Each story has its own background.
9. Select **Stair** and click the bottom and the top of the run. The stair goes up to the next
   story. The panel changes it to an L stair or a U stair with a landing. Select **Chimney**
   and click where it goes.
10. Click in a room to give it a name and its own clear height.
11. Click **Furniture** (I) and choose a piece. Click on the plan to place it. Near a wall, its
    back goes against the wall. R turns it, and the panel sets its size.
12. Click **Services** (E) and choose a device or a line. A device for a wall goes against the
    wall. A line connects to devices; a double click ends it. The **Layers** menu shows or hides
    electricity, heating, PV, and the insulation.
13. Without a selection, the panel shows the story, the north direction, and the roof. Drag the
    compass at the top right to turn north.
14. Click **Save** to write the plan to a file. **Export** writes a PDF, an SVG, a DXF, or a glTF
    model.

| Key                      | Action                                            |
| ------------------------ | ------------------------------------------------- |
| V, W, D, N, M, C         | Select, Wall, Door, Window, Measure, Set scale    |
| Shift+click              | Add an object to the selection, or remove it      |
| Drag on the empty plan   | Select the objects in a box                       |
| Shift (wall tool)        | Keep the direction at a multiple of 45°           |
| Shift (drag a wall)      | Move the wall freely, so that the next walls turn |
| Alt                      | Turn off the grid and the snap of the direction   |
| Space + drag, right drag | Pan                                               |
| Two-finger scroll        | Pan on a trackpad. A pinch zooms.                 |
| Mouse wheel              | Zoom                                              |
| Arrow keys, Shift+arrow  | Move the selection by 5 cm or 50 cm               |
| Esc                      | Stop the current action or clear the selection    |
| Delete, Backspace        | Delete the selection                              |
| F                        | Show the whole plan                               |
| Ctrl/Cmd+C, X, V, D, A   | Copy, cut, paste, duplicate, select all           |
| Ctrl/Cmd+Z, Shift+Z      | Undo, redo                                        |
| Ctrl/Cmd+S, Shift+S, O   | Save, save as, open                               |

The wall tool snaps the direction of a wall to multiples of 15° when it is near one.

### Files

A plan is a `.grundriss` file. It is a ZIP file that contains:

- `plan.json`: the building with its stories.
- `backgrounds/`: the background image of each story as a separate file.
- `exports/`: a PDF with a page for each story, an SVG for each story, a DXF, and a glTF model,
  so that other programs can use them without Grundriss.

The app also opens and saves a plan as one `.json` file. That file contains the background image
as a data URL.

Chrome and Edge save to the same file again. Firefox and Safari download a new file each time.

### Assisted tracing

The panel shows **Assisted tracing** when the plan has a background. These steps use OpenCV.js.
The browser downloads it (about 10 MB) the first time that you use one of them.

1. **Straighten**: click the four corners of the plan on a photo. The app corrects the
   perspective, so that the plan becomes a rectangle. Then set the scale again.
2. **Clean up**: the app removes the uneven light and the specks, and gives a black and white
   image. The slider sets the strength.
3. **Suggest walls**: the app finds the thick dark lines of the walls and shows them in green.
   Click a suggestion to reject it. Then click **Add walls**.

4. **Recognize plan**: a neural network finds the walls, the doors, and the windows. Doors show
   in orange and windows in blue. Click a suggestion to reject it. Then click **Add walls**.
   The network runs in your browser. The first time, the browser downloads about 15 MB.

The network learned only from synthetic plans that Grundriss generates. It can make mistakes on
real scans, so check the result. The suggestions of step 3 find walls with a solid fill. They do
not find walls drawn as two thin lines. A door gap stays open, so put a door in it and close the
wall. Undo removes each step.

### Roofs

Without a selection, the panel lists the roofs. **Gable**, **Hip**, **Shed**, and **Flat** add a
roof on the outline of the walls of the active story. Click a roof to change it:

- **Sides**: each side of the outline is an **eave** (a face rises from it with its pitch) or a
  **gable** (a vertical wall). The plan shows the number of each side. The gable preset puts a
  gable at the end of each wing.
- **Outline**: drag the corners on the plan. Drag a + in the middle of a side to add a corner.
  Select a corner and press Delete to remove it. A second roof, for example of a garage, can have
  its own outline.
- **Eave height**: by default the top of the walls of the story.
- **Dormers** and **roof windows** go on an eave side, at a position along the side and a
  distance from the eave.

### Energy and photovoltaic

Without a selection, the panel shows the energy of the building:

- **Energy**: the heat loss of the building in kW and in W/m². The groups below set the layers of
  the outer walls, the roof, and the floor on the ground, the U-values of windows and doors, and
  the temperatures. A click on a room shows its heat loss and its heating. A click on a wall
  shows its U-value, and the wall can get its own layers.
- **Photovoltaic**: **Add a PV field** fills the best face of the roof with panels. The field
  gives the number of panels, the peak power, and the yield per year.

### Location and climate

The **Location** group sets the place of the building: search a town, or type the latitude and
the longitude. **Load climate** then downloads the hourly weather of the last 10 complete years
from [Open-Meteo](https://open-meteo.com) and stores a typical year in the plan (about 40 kB). So
the plan works offline after that. The app sends the place to open-meteo.com only when you click
**Search** or **Load climate**.

From the stored year, the app calculates:

- the PV yield of each face: the sun position for each hour, the Hay–Davies model for the
  irradiance on the tilted face, and losses for the angle, the cell temperature, and the system
  (14 %). The yield ignores shade.
- the mean temperature of each month, and the heating degree days G20/15.
- the design temperature: the coldest mean of 48 hours in the 10 years. The Energy panel can use
  it for the temperature outside.

Without a climate, the PV yield is a general estimate for Central Europe.

The values are estimates for planning. They are not a calculation by a standard and not an
energy certificate.

### Furniture sources

- **Generic**: simple shapes that the app makes, with any size.
- **Kenney**: the [Furniture Kit](https://kenney.nl/assets/furniture-kit) by Kenney, CC0 1.0. The
  app contains it, so it works offline.
- **Poly Haven**: realistic models from [polyhaven.com](https://polyhaven.com), CC0 1.0. The app
  asks Poly Haven for the list and downloads a model when you choose it. The plan file then
  contains the model.
- **Imported**: your own `.glb` files, or `.gltf` files with embedded data. Check the license of
  each model yourself.

## Develop

```sh
npm ci
npm run dev        # the app on http://localhost:5173/
npm run dev:site   # the website
npm test
npm run build      # the website in dist/ and the app in dist/app/
```

See [`AGENTS.md`](AGENTS.md) for the architecture and the conventions. On `main`, the workflow
`.github/workflows/pages.yml` deploys the website and the app to GitHub Pages.

## Credits

The furniture models come from [Kenney](https://kenney.nl) and [Poly Haven](https://polyhaven.com)
(both CC0). Weather data by [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0). The free
Open-Meteo API is for non-commercial use. Grundriss uses [Three.js](https://threejs.org), [OpenCV.js](https://opencv.org),
[ONNX Runtime Web](https://onnxruntime.ai), and [fflate](https://github.com/101arrowz/fflate).

## License

[MPL-2.0](LICENSE)
