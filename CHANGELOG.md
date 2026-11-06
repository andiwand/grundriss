# Changelog

The changes that a user notices.

## Unreleased

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
