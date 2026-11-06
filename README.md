# Grundriss

Grundriss is a browser app for floor plans. Load a scan or a photo of a plan, trace the walls on
it, add doors and windows, and see the plan in 3D. The app runs fully in your browser. Your plans
stay on your computer as files.

_Grundriss_ is the German word for a floor plan.

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
11. Without a selection, the panel shows the story, the north direction, and the roof. Drag the
    compass at the top right to turn north.
12. Click **Save** to write the plan to a file. **Export** writes a PDF, an SVG, a DXF, or a glTF
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

The suggestions find walls with a solid fill. They do not find walls drawn as two thin lines. A
door gap stays open, so put a door in it and close the wall. Undo removes each step.

## Develop

See [`AGENTS.md`](AGENTS.md).

## License

[MPL-2.0](LICENSE)
