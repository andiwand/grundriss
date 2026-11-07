# Changelog

The changes that a user notices.

## Unreleased

- 3D: each wall is one body with real holes for its doors and windows. Walls meet in a miter at
  a corner, flush in a straight line, and at the face of the other wall at a T. The lines show
  only at real edges, not at the joints of the old boxes. A pitched roof has a thickness of 20 cm, and the roof of a dormer 12 cm with an overhang of 15 cm over its walls. The window of a dormer is see-through: its wall
  and the roof under the dormer have a hole,
  with its ridges, hips, valleys, and edges as lines. The walls under a roof stop inside it, so
  they do not come through.
- Colors: each side of a wall has a color in the 3D view. A room has a wall color for its side
  of its walls, the building has a facade color for the outside, and a roof has a color for its
  top and its underside. A single wall can have its own color on one side, for example an accent
  wall. The panel of a wall names the room on each side.
- 3D: the floor and the slab over a stair have a hole for it, so the stair comes up through the
  floor of the story above.
- 3D: no shadow acne (stripes and rings) on walls, roofs, and floors. The faces of the walls and
  the roofs point outward, and the shadows use their back side.
- 3D: a roof window is see-through: the roof has a hole under it, and its frame lines the hole.
- Website: in the chapters without the roof, the attic walls stop at the slope, like in the
  finished house. Before, they were full stories until the roof came.
- 3D: a gable of a roof has a hole for each window of the wall behind it, so the windows of an
  attic show from the outside.
- The example house: a straight stair in the living room starts beside its door and arrives in
  the attic near the ridge, the hall has a wardrobe, the bathtub stands inside the house, the beds stand against the walls, and
  the attic has more furniture (a sofa, a desk in the kids room, nightstands, a wardrobe, and a
  toilet).

- 3D: when only one story shows, the roofs of that story show only if it is the top story. So
  the roof of a low wing does not hide the rooms of a lower story. "All stories" shows all roofs.
- The start card has an "Open a plan" button.
- 2D: a map under the plan. The Layers menu shows OpenStreetMap or the aerial photo of
  basemap.at (Austria). The map lies at the location of the building and turns with North. The
  location has a plan point that is at its latitude and longitude. The browser loads the map
  only when you turn it on, because each request sends the place to the map server.
- Energy: "Heating per year" in the panel. With the climate of the location, the app makes a
  monthly balance of the heat loss, the sun through the windows, and the internal gains (in the
  spirit of EN ISO 13790). It shows the heat demand per year and per m², an efficiency class, the
  final energy, the cost, and the CO₂ of the heating, and the heat demand of each month as a
  chart. The heating is a heat pump, a gas, oil, or wood boiler, district heating, or direct
  electric, with its efficiency and price. With a heat pump, the panel shows the part that the PV
  can cover in the balance of each month.
- Location: "Move the map" places the map under the plan with the mouse. A drag moves the map,
  and Shift+drag turns it around the place (this changes North). Esc or "Done" ends it. Each drag
  is one step of the undo.
- The Layers menu can hide the background image of the 2D plan. The image stays in the plan.
- 3D: the floor of a story over a cellar or another story does not flicker any more.

- 2D: a Pan tool (P) moves the view with a drag. The Select tool has the normal arrow, because
  it selects. The cursor is an open hand while you hold Space, and a closed hand during a pan.

- The location of the building: the panel without a selection has a "Location" group with a
  place search and the latitude and the longitude. "Load climate" downloads the hourly weather of
  the last 10 complete years from Open-Meteo and stores a typical year in the plan (about 40 kB),
  so the plan works offline after that. The app sends the place to open-meteo.com only on a click.
- With a climate, the PV yield of each field comes from the radiation of the location: the sun
  position for each hour and the irradiance on the face, with the losses of a real system. The
  panel shows the mean temperature, the heating degree days, the design temperature, and the PV
  yield of the best roof face. The Energy panel can use the design temperature for the outside.

- The start card lies in the middle of the 2D and the 3D view, and it can open an example house:
  two stories, a roof with a dormer, furniture, services, and PV.

- 2D: a two-finger scroll on a trackpad pans the plan, and a pinch zooms. A mouse wheel still
  zooms.
- 3D: a left drag turns the view around the point of the building under the cursor, with a
  small blue mark at that point. The wheel zooms to the point under the cursor.

- Faster on slow computers: after a change, the app updates the views once in the next frame.
  During a drag, the 3D view and the panel update about 8 times per second, and at once after
  the drag. The 3D view uses at most twice the pixel density of a normal screen. The website
  draws its 3D picture only when it changes.

- A website for Grundriss: a scroll story that builds one house with the engine of the app, from
  the scan to the solar panels. GitHub Pages serves the website at the root and the app at
  `/app/`. The README has the logo, a list of the features, and pictures.
- A roof on the outline of the walls gets one side for each straight run of the outline. Before,
  each inner wall that met an outer wall made a corner, so a face was in pieces and PV fit only
  on one piece.
- In 3D, a wall piece over a door or a window under the roof slope no longer shows above the
  roof.

- Roofs: a building can have several roofs, each on its own outline. "Add roof" takes the
  outline of the walls of the active story, with the presets gable, hip, shed, and flat. Each
  side of the outline is an eave or a gable, with its own pitch and overhang, so a roof can be a
  hip roof on an L, or a gable roof with a hip at one end. The eave height can differ from the
  top of the walls.
- A selected roof shows its outline with the numbers of its sides. Drag a corner to move it, or
  drag a + in the middle of a side to add a corner. Delete removes a corner.
- Dormers (gable, shed, flat) and roof windows on the faces of a roof. PV fields leave them out.
- The 3D view has no more parts that go through each other:
  - A roof sits on the outer face of the walls, so the walls do not come up through the roof.
  - A roof under an upper story starts at the floor of that story, so the floor does not come
    out under the roof. The walls go up to that floor, so no gap stays at the edge of the floor.
  - The walls of a story under a roof, for example of an attic, stop at the roof.
  - A dormer or a roof window that does not fit on its roof face, for example past the ridge, does
    not show. The roof panel shows a warning for it. A roof window has a closed edge.
  - The north label does not show through the building.
- Attics: the heat loss of a room under a pitched roof uses the sloped area of the roof over the
  room, the walls up to the roof (knee walls and gable triangles), and the volume under the roof.
  The walls and the windows of dormers count too.
- The room panel and the story panel show the living area by the German WoFlV for rooms under a
  roof: a clear height of 2 m or more counts fully, 1 m to 2 m counts half. The 2D editor shows
  the lines of 1 m and 2 m clear height as thin dashed lines.
- In the 3D view, an attic wall under a dormer goes up to the roof of the dormer. A gable of the
  roof no longer flickers on the outer face of the attic wall under it.
- A button of the panel with a long text gets its own row, so its text stays inside it.
- The furniture catalog has the new groups Storage, Lighting, and Decor, so "Living" holds only
  the living room pieces. All tabs show the groups in the same order, and Poly Haven has groups
  too. A word of a name matches only at the start of a word, so "Woven basket" is not kitchen.
- Fixes from a review of all the code:
  - The position of a dormer or a roof window on its side was mirrored on most roofs. A roof
    outline with a repeated corner made a flat roof. The sides of a flat roof on an L faced inward.
  - The roof heat loss goes to the highest room under the roof, for example the attic, not to the
    ground floor under it. The outline of a U stair has no more empty area next to its first flight.
  - When the user dropped a corner on a wall, the wall did not split. An undo during a drag stopped
    the drag with an error. A pasted L or U stair became straight. Arrow keys moved a door along
    its wall when the wall moved too. "Fit" ignored stairs, chimneys, and furniture.
  - A room inside another room no longer takes the data of the other room. A wall that sticks out
    of the building no longer goes into the outline of a new roof.
  - Recognized openings went on the wrong wall after the user rejected a wall. The traced walls
    were about one pixel off.
  - Without a network, the Poly Haven catalog sent requests without end. A second click during a
    download added the model two times. The Furniture button stayed active after the catalog closed.
  - The PDF export showed "€", "–", and other characters wrong. A line break or an umlaut in a name
    broke the DXF export. A background in an unusual image format lost its type in a package.
  - Esc during a drag stops only the drag and puts back the state before it. A second Esc
    stops the wall chain or clears the selection.
  - A double click with the select tool no longer clears the selection.
  - A click that adds no wall, for example a copy of a wall, or a delete that removes nothing,
    makes no undo step.
  - A corner that joins a copy of a wall keeps the doors and windows of the copy on the wall
    that stays.
  - The panel of a selection of more objects counts all kinds, for example furniture and
    devices, and shows only the kinds in the selection.
  - The rows of a group in the panel have the same space of 8 px between them.

- Building services (E): devices for electricity (sockets, switches, lights, network sockets,
  smoke detectors, the distribution board) and heating (radiators, boilers, heat pumps, the
  manifold of a floor heating). A device for a wall snaps to the wall. Lines for cables and
  pipes connect to the devices. The Layers menu shows or hides each system.
- Insulation: the layers of the outer walls, the roof, and the floor, with their U-values. A wall
  can have its own layers. The insulation layer colors the outer walls by their U-value.
- Heat loss: an estimate for each room and for the building. The room panel compares it with the
  power of the heating in the room, and it has floor heating and its own temperature.
- Photovoltaic: fields of panels on the faces of the roof, with the peak power and an estimate of
  the yield per year. The 3D view shows the panels.
- The panel shows the lengths of the cables and pipes and the number of devices.

- Recognize plan: a neural network in the browser finds the walls, the doors, and the windows
  of the background. They show as suggestions to accept or reject. The network learned only from
  plans that Grundriss generates, so its license is the license of the app.

- Furniture (I): a catalog with four sources. Generic pieces with free sizes and plan symbols,
  the Kenney Furniture Kit (CC0, part of the app), realistic models from Poly Haven (CC0,
  downloaded on demand), and the import of your own glTF or GLB files. Near a wall, a piece
  turns with its back to the wall. R turns a piece by 90°, and Shift+R by 15°. The panel sets
  the size, the height above the floor, and the rotation.
- The 2D editor shows a model as an image from above. The exports draw the furniture, and a
  package contains the downloaded and imported models and a list of credits.

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
