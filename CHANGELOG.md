# Changelog

The changes that a user notices.

## Unreleased

- Server plans without the network: the app keeps a copy of each plan of a server that it opened,
  and opens it to view when the server does not answer. The Projects page shows the copies.
- Images once: the server and the history of the browser keep each large image (a background, a
  model, a photo) once, also if many revisions use it, so that they need much less space.
- Server: links that ended go away by themselves. The server settings list all share links with
  the plan of each link.
- `compose.yaml` starts the server with Caddy for https.
- Projects page: a plan of a server shows a picture of its ground floor, like a plan of the
  browser, with a small cloud in the corner. The plans of the browser are under "In this browser".
- A plan to view shows only the tools to view: select and pan. A drag does not move an object, the
  panel shows the values as text, and the buttons that change the plan go away.
- Phone: the panel stays down while you draw. Before, a door, a window, a stair, or a dimension
  opened it over half of the plan.
- Phone: a pipe or a cable shows while you draw it, and the first point of a wall, a stair, or a
  dimension shows after the tap. Before, a pipe showed only after Done.
- Controls: the fields, the lists, and the check boxes look the same in the panel and in the
  dialogs. The controls of the panel start at one line, a list with long values goes under its
  label so that it shows the whole value, and each check box is before its label. A dialog
  without a choice shows no radio buttons.

## 0.3.0 – 2026-11-08

- Versions: a click on the name of the plan lists its versions. A plan of a server shows all its
  revisions; a plan of the browser shows its history, with a version at each save to a file and
  one every 5 minutes while you edit (the newest 20). A version opens as a copy, or comes back
  with Restore; undo takes a restore back. The Projects page has the versions of each plan too.
- Files: a saved file knows its revision. Before the app replaces a file, it checks that nobody
  saved the file in the meantime; else it offers to save the plan as a new file.
- Server: edit leases belong to both the token and the browser session. Saves check access and
  the lease after the upload completes. Removed tokens stop receiving live events.
- Server: a failed disk write rolls back the state in memory. Invalid request bodies return a
  client error, and large uploads return the size error without closing the connection early.
- Shared plans: changes stay available after a lost lease. Old network replies cannot change
  another open plan, and live updates do not replace unsaved work. A waiting editor loads the
  latest revision before it starts to edit.
- Connections: the app works on a local HTTP server without secure-context UUID support.
  Requests have a timeout. Share links do not include the private address of the current app.
- Copies: a conflict copy must reach browser storage before the server session ends. A move to
  the browser does not delete a newer server revision or a plan that another session edits.

## 0.2.0 – 2026-11-08

The first version with a number. The app shows it in the help of the shortcuts.

- Server: a small self-hosted server keeps plans in one place, from the Docker image
  `ghcr.io/andiwand/grundriss`. Each person and each shared plan has a link, and the link is the
  access. Root sets the name of the server and adds users with their rights and an end date.
  One person edits a plan at a time; the others view it, and see each change at once. A save
  never replaces a newer version. See "Plans on your own server" in the README.
- Share: a plan of a server gets links to view or to edit it, with an end date, from Share in
  the top bar. Plans of the browser and of a server go both ways, as a copy or as a move.
- Top bar: Share is next to Export, and the language is at the end of the bar.
- Saving: a delayed file save marks only the saved snapshot as saved. It does not change a
  plan opened during the save. Autosave waits for the project lock and a successful write
  before the app leaves a changed plan without a warning.
- Variants: background images stay with stories that are absent from another layout. JSON
  files and packages keep these images. Background edits and removal follow the story id.
- Editing: failed edits roll back. Undo keeps changes in the middle of long notes. Image
  processing and model imports check that their document, story, and variant are still open.
- Areas: triangles of a concave polygon do not overlap when a vertex lies on a diagonal.
- Energy: the heating balance stays finite for very large heat gains. Climate calculations
  use the sun path of the correct location, also when two places have the same weather series.
- Renovation: the estimate counts a new window once when the variant also improves glazing.
- Files: the reader rejects duplicate object ids and invalid PV dimensions and counts.
  Backup restore rejects damaged metadata and missing project files.
- Number fields reject empty values and values above their maximum.
- Structure: Scale is disabled without a background image, like Straighten. The shortcut C then
  only says that a background is needed first.
- Renovation: one column in a panel of medium width, next to the 2D and 3D views. Each variant
  is a group with its key numbers, a table of the cost items with a field for your own price,
  its measures, and its name. "Compare" next to the heading opens the table of all variants in
  a dialog, so the panel stays as it is.
- Location: one wide search field that lists matching places while you type. The arrow keys and
  Enter pick a place. From the third letter on, the search sends what you type to open-meteo.com.
- Website: shorter, plainer texts in English and German.
- Renovation: "Compare" shows the plan and all variants in one table, with the cost, the
  subsidy, the energy cost, the saving, the payback, the cost over 20 years, the heat demand,
  the CO₂, the PV, and the rooms. The best value of each row is green.
- Renovation: each item of the estimate takes an own price, for example from an offer. A
  button next to an own price, and next to an own total, goes back to the estimate.
- Doors and windows: each one has a way to open (a hinged leaf, sliding, or fixed: a door
  without a leaf, or fixed glass) and one or two leaves. A window opens into the room, and a
  window wider than 1 m has two leaves. The 2D plan, the exports, and the 3D view show the
  leaves; a door in 3D is open, so that you see its direction. Old files keep their doors; their
  windows get leaves that open into the room.
- Collisions: the plan marks objects that collide with a red dashed outline, and the panel lists
  them: doors and windows that overlap or go into a corner, furniture in a wall, on a stair, or
  on another piece, and furniture in the way of a door or a window. A new or moved door or window
  goes to the nearest free place on its wall.
- 3D editing: click an object in the 3D view to select it. Drag a selected piece of furniture, a
  device, a stair, or a chimney to move it, and a door or a window to move it along its wall.
  The object under the mouse shows in a color.
- Variants: open a variant to change it in all topics, also its walls, rooms, and furniture,
  while the plan stays. "Another floor plan" starts a variant for a new layout, for example
  with a wall less. The estimate counts the walls to remove and to build, the new openings, and
  the openings to close, and warns if a wall to remove can carry a load. A switch in the top bar
  shows which variant is open. The variants work without the climate; only the energy cost
  needs it.
- Phone: the status line no longer lies under the sheet of the panel. The sheet, the status line,
  and the bar at the bottom keep their places also when the toolbar of the browser moves.
- Projects page: one column in the middle of the window, without a large box. Three tiles at the
  top start a plan: a new plan, a file, or the example house. Your plans follow below, and the
  backup, the restore, and the trash are links at the end.
- Files: a plan file has version 3. It has values that older versions of the app do not know
  (water and communication, the half hip, unheated stories), so an older app says that it cannot
  read the file, and does not read it wrong. The app reads the versions 1, 2, and 3.
- Phone and tablet: in a narrow window, the app shows one view at a time, the topics are in a
  bar at the bottom, the files, layers, export, and help are in the "More" menu, and the panel
  is a sheet at the bottom: tap or drag its handle for more or less. A selection opens it. Two
  fingers zoom and pan the 2D plan; a finger next to an object selects it; a tap on a room
  selects the room. Drawing tools have a "Done" button in place of Esc and Enter. On a touch
  screen, the buttons are larger.
- German: the app has a German interface, with decimal commas. It follows the language of the
  browser, and the language button in the top bar switches it.
- Notes and photos: a wall, a door, a window, a device, a line, a piece of furniture, a stair,
  a chimney, and a room can have a note with photos. On a phone, the photo button opens the
  camera.
- Electricity: a device or a cable can have a circuit. The distribution board in Utilities lists
  the devices and the cable length of each circuit.
- Report: Export → Report (PDF) gives the areas, the envelope, the heat loss and the heat pump
  readiness of each room, the energy per year, the summer, the renovation, the building
  services, and the plans. Export → Quantities (CSV) gives the rooms, the openings, the areas of
  the envelope, the materials of its layers, and the services, as CSV files in a ZIP file.
- Heat pump: the app calculates the performance of each hour from the flow and the source
  temperature (air or ground). The flow comes from the radiators of the rooms, or you set it. A
  fixed seasonal performance factor is still possible. The panel shows the seasonal factor.
- Heat pump readiness: Energy lists the flow temperature that the radiators of each room need
  (their power at 75/65/20 °C), with good up to 45 °C and fair up to 55 °C. The room panel shows
  it too.
- Summer: Energy has a check of each room against overheating, with and without external blinds.
- PV shade: the yield of a PV field counts the shade of the roofs, the dormers, and the chimneys.
- Envelope: thermal bridges (ΔU), the air change, the airtightness n50, and the heat recovery of a
  ventilation system. Roof windows and dormer windows count as windows with their sun.
- Areas: the room labels show the net area inside the walls. The energy per m² uses the gross
  floor area (BGF), and the WoFlV living area uses the net area. The class says that it is an
  estimate.
- Renovation: prices for Austria or Germany, the interest, and the change of the energy prices
  per year. The payback time counts them. For Germany, a button fills in an estimate of the BEG
  subsidy.
- Projects: a deleted project goes to the trash for 30 days. "Back up all projects" saves one ZIP
  file, and "Restore a backup" reads it. The page warns if the browser can delete the plans or if
  the storage is almost full. A plan that is open in another tab is not saved a second time.
- A large photo of a plan becomes smaller when it loads (at most 4000 pixels), so that the plan,
  the browser storage, and the undo stay fast. The undo keeps the last 200 steps.
- Keyboard shortcuts: "?" shows a list of them.
- Website: a German version at `/de/`, with a language switch; a German browser gets it at
  once. A new section shows who the app is for, and new chapters show the heat pump readiness,
  the renovation with cost and subsidy, and the visit on site with notes and photos. The texts
  cover the report, the quantities, the offline app, and the note that the values are estimates.
- Renovation: a new topic after Energy. It compares variants of the building with the plan. A
  variant starts from the plan with a measure (insulation, triple glazing, a heat pump, PV, a
  battery, a heated or unheated cellar), and more measures can go into it. Each variant shows an
  estimate of its cost with its items, a field for the price of an offer and for the subsidy, the
  energy cost per year, the saving, the payback time, and the CO₂. The variants moved here from
  Energy, and they keep the household, the battery, and the PV fields too.
- Energy: an hourly balance of electricity. The new Electricity group sets the household
  electricity, the battery, the price from the grid, and the payment for the feed-in. The
  balance shows the PV used in the building, the part of the electricity from the PV, the grid,
  and the energy cost per year. An electric heating now uses the price from the grid.
- PV on flat roofs: a field on a flat roof can stand on a rack, in one direction or east-west,
  with its own tilt and direction. The rows of a rack in one direction keep the distance for the
  winter sun. The yield, the PV share of the energy, and the 3D view use the tilted panels. A new
  field on a flat roof gets a rack to the south with 15°.
- Roofs: a new kind of side, the half hip. Its gable wall goes up to a height, and a small hip
  face closes the top. The hip lines go on to the overhang, so the faces meet without a gap. The
  roof panel and the add buttons have a **Half hip** preset.
- Energy: hot water. The Hot water group sets the people, the liters per person and day, and
  the heater. The cost, the CO₂, the final energy, and the PV share include it.
- Energy: heated and unheated stories. A new cellar is unheated. The heated rooms next to an
  unheated story lose heat through the new slab layers of the envelope. The walls of a heated
  cellar lose less in the ground.
- Build: the GitHub workflow uses the actions that run on Node.js 24, and builds with Node.js 24.
- 2D: when the 2D pane changes its size, for example from split to 2D only, the point at the
  center of the view stays at the center.
- Energy: the topic shows one view, 2D or 3D, and a wide panel for the calculations. The edge
  between the view and the panel is where the edge between the two views of split is. The panel
  has the inputs (location, envelope, heating) in one column and the results (heat loss, heating
  per year, PV) in the other. Split is not available in Energy; after Energy, the view of before
  comes back.
- Example house: the dining chairs, the sofa, the armchair, the shelf, and the kitchen counter
  face the right way. The chairs stand beside the tables, not under them.
- 2D: the names and the areas of the rooms are on top of the furniture, with a halo, so they stay
  readable.
- Projects: the app starts with the Projects page, without an open plan. The page has a tile for
  a new plan and a tile to open a file, the plans in this browser as tiles with a picture of the
  plan, and the example house under Examples. Until a plan is open, the top bar shows no topics
  and no tools of the plan. A click on **‹ Grundriss** at the top left closes the plan and goes back. The open project saves itself in the browser (IndexedDB) after each change, so a reload
  loses nothing. A project can get a new name, a copy, or go away. Save to a file stays for
  backups and to share a plan.
- Overview: the first topic shows the Contents tree of the open plan: each story with its rooms, walls, doors,
  windows, stairs, furniture, and utilities, and the roofs, the PV, the location, and the
  climate. A click opens the part in its topic and selects it.
- Installable app: the app is a PWA. Chrome and Edge show **Install** in the top bar of the
  Projects page. The
  installed app starts without the internet and opens `.grundriss` and `.json` files. In the
  browser, the app works as before.
- Panel: a button with a long text grows to its lines. Before, the text came out of the button.
- Top bar: in a narrow window, the buttons first show only their icons, and then the bar grows to
  a second row. The page does not scroll to the side.
- Topics: the top bar has six topics: Overview, Structure, Utilities, Interior, Energy, and Renovation. Each
  topic shows its own tools in the palette, its own panel when nothing is selected, and its own
  layers. The background, the scale, and the tracing are in Structure, and the map under the plan
  is in the Location group of Energy. Select, Pan, and Measure are in all topics. A shortcut of a tool opens its topic. A
  change in the Layers menu stays with the topic.
- Utilities: four systems, each with its own menu in the palette: water, heating, electricity,
  and communication. New devices: water outlet, waste connection, floor drain, outdoor tap, water
  meter, hot water tank, PV inverter, battery storage, phone, TV, and SAT sockets, router,
  network cabinet, and SAT multiswitch. New lines: cold water, hot water, circulation, and waste
  water pipes, PV cable, and phone, TV, and SAT cables. The network socket and the network cable
  move to communication, also in old files. The DXF export has the layers WATER and COMMS.
- Utilities: the heat source and its efficiency are in the Heating group, and the PV fields are
  in the Electricity group. The Energy topic keeps the price, the heating per year, and the PV
  yield.
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
- Website: the card of the last chapter does not show at the top of the finale.
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
