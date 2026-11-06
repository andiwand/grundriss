# Grundriss

Grundriss is a browser app for floor plans. Load a scan or a photo of a plan, trace the walls on
it, add doors and windows, and see the plan in 3D. The app runs fully in your browser. Your plans
stay on your computer as JSON files.

_Grundriss_ is the German word for a floor plan.

## Use

1. Click **Background…** and choose a scan or a photo of a plan.
2. Click two points with a known distance between them, for example the ends of a wall. Type
   the real length and click **Apply**.
3. Select the **Wall** tool and click the corners of the walls. A click on a corner or on a wall
   ends the chain.
4. Select **Door** or **Window** and click on a wall.
5. With **Select**, drag corners, walls, doors, and windows. The panel on the right shows the
   values of the selection.
6. Click **Save** to write the plan to a file.

| Key                 | Action                                     |
| ------------------- | ------------------------------------------ |
| V, W, D, N, C       | Select, Wall, Door, Window, Set scale      |
| Shift (wall tool)   | Keep the wall horizontal or vertical       |
| Alt                 | Turn off the grid                          |
| Space + drag        | Pan                                        |
| Mouse wheel         | Zoom                                       |
| Esc                 | Stop the wall chain or clear the selection |
| Delete, Backspace   | Delete the selection                       |
| F                   | Show the whole plan                        |
| Ctrl/Cmd+Z, Shift+Z | Undo, redo                                 |
| Ctrl/Cmd+S, O       | Save, open                                 |

Chrome and Edge save to the same file again. Firefox and Safari download a new file each time.

## Develop

See [`AGENTS.md`](AGENTS.md).

## License

[MPL-2.0](LICENSE)
