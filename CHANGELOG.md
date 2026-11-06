# Changelog

The changes that a user notices.

## Unreleased

- Stories: a building has more than one story, with cellars under the ground and an attic.
  The list at the bottom left of the 2D editor selects the active story and adds stories. The
  2D editor shows the walls of the story below as dashed lines.
- The Stair tool (S) draws a straight stair up to the next story. The panel shows the number
  and the height of the steps.
- A stair can be straight, L-shaped (a quarter turn), or U-shaped (a half turn), with a
  landing. The panel sets the shape, the side of the turn, and the run of the second flight.
- Rooms: a click in a room selects it. A room can have a name and its own clear height, for
  example for a lowered ceiling. The label shows the name, the area, and a height of its own.
  The 3D view shows the ceiling of a room with its own height.
- The Chimney tool (H) puts a chimney. It goes up through the stories above and the roof.
- A roof over a story: gable, hip, shed, or flat, with pitch, overhang, and ridge direction.
- The orientation: drag the compass at the top right of the 2D editor to set north.
- The 3D view stacks the stories. It shows the stories up to the active story, or all stories
  with the "All stories" toggle.
- The PDF has one page for each story, and the DXF has layers for each story. The exports show
  stairs, chimneys, and a north arrow.
- The file format has version 2. The app reads files of version 1 as a building with one story.

- The first version: load a scan of a plan as the background and set its scale, draw walls,
  put doors and windows in them, move and delete them, undo and redo, see the rooms with their
  areas, see the plan in 3D, and open and save plans as JSON files.
- A new look: icons, a floating tool palette over the 2D plan, the panes as cards, a top bar
  with the file name and a dot for unsaved changes, and a light and a dark theme that follow
  the system.
- The panel shows the units next to the fields, the plan figures as tiles, and a slider for the
  opacity of the background.
- A new plan shows a card with the first steps.
- Each pane has a button that fits the plan in the view.
- Fix: the halo behind a dimension label keeps its size at each zoom.
- Select more than one object: Shift+click, or drag a box on the empty plan. Move, delete,
  copy, cut, paste, and duplicate the selection. The arrow keys move it.
- A door has a hinge side and a swing direction. A new door opens to the side of the click.
- The Measure tool (M) adds dimension lines.
- The wall tool snaps the direction to multiples of 15°. Shift keeps it at multiples of 45°.
- A drag of a wall keeps the angles of the next walls. Shift moves the wall freely.
- Pan with Space+drag or with the right mouse button. A drag on the empty plan selects now.
- Export the plan as PDF, SVG, DXF, or glTF.
- A plan is now a `.grundriss` package: a ZIP file with the plan, the background image, and the
  exports. The app still opens and saves `.json` plans.
- Assisted tracing with OpenCV.js: straighten a photo, clean up a scan, and get suggested walls
  to accept or reject.
