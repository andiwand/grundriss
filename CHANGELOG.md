# Changelog

The changes that a user notices.

## Unreleased

- The version of the app shows at the end of the home page and in the menu of the file name.
- Fixes: a merge of walls keeps the doors and the windows in place also when the kept wall is
  not the first one of the line. A curved wall counts in the cost of a variant, keeps a radius
  of at least half its thickness, and a door on it follows the arc in the 3D view. Without the
  stories above, a chimney in 3D ends at the top of the walls. On a phone, **All stories** is
  not under the tools any more, and a low window shows all tools of the rail. A tool in the 3D
  view opens the 2D view again also when it is the same tool. The German app translates the
  errors of the climate and of a damaged file.
- Plan files are YAML now, so that a person can read them: `plan.yaml` in a `.grundriss` package,
  the `.yaml` file of **Save as**, and the files of a backup. The app
  still opens `.json` files and older packages and backups, and a `.json` file stays JSON when
  you save it again.
- A file that does not open shows a dialog with the reason. Before, the reason was only in the
  status line at the bottom, and it looked as if nothing happened.
- Angles: the tool **Angle** (K) measures an angle with three clicks (the corner, then a point
  on each side) and keeps it on the plan as an arc with the degrees. Drag the arc to change its
  radius; **Other side** in the panel gives the angle on the other side. The exports draw it.
- Two selected walls show the angle between them, on the plan and in the panel, also when they
  do not meet. **Add angle dimension** keeps it on the plan.
- Curved walls: drag the handle in the middle of a selected wall to bend it into an arc, or use
  **Curve the wall** and the **Bulge** in the panel. A curved wall has its arc in 2D, in 3D, in
  the exports, in the area of its room, and in the energy model. Doors and windows follow the
  arc. **Make the wall straight** makes it straight again.

## 0.7.1 – 2026-11-18

- Server: on the page of the account, the fields and the buttons of each card end at the right
  edge of the card, like Log out. Before, they ended at a line in the middle of the card.

## 0.7.0 – 2026-11-18

- The tools and the stories are a rail at the left of the views. The rail serves the 2D and the
  3D view, so the 3D view alone has tools and stories too. In the 3D view, a tool that draws
  opens the 2D view next to it. The stories show their number (0 is the ground floor), and a chip
  at the top left of each view names the active story. Nothing floats over the plan but the
  compass. The tools show no keys; their titles name them.
- The name of the plan opens the menu of the file: New plan, Open a plan, Save, Save as, and
  Versions. The top bar has room again, so the topics keep their names.
- The area of the rooms is the area inside the walls everywhere: in the list of the rooms of
  Interior and in the Plan of Structure. Before, both used the center lines of the walls, so the
  kitchen of the example house had 16.00 m² in the list and 14.36 m² on the plan.
- Structure: the panel has two parts, This story and Whole building. Delete story is at the end
  of This story.
- Utilities: the buttons "Add water", "Add heating", and so on are gone, because the rail has
  the same menus. The heat source (kind, source, flow temperature) is in Energy, where the
  calculation uses it.
- A selected room shows its name first, and a selected wall shows Split after its height. The
  heating of a room and the insulation of a wall are groups, open in Energy and Renovation and
  closed in the other topics. An inner wall shows no empty insulation values.
- A list in the panel is always beside its label. A long value ends with "…", and its title shows
  the full value.
- Website: the chapters Stories and Roof are one chapter, and the texts name the outdoor parts
  and the shade of trees and neighbors.

## 0.6.4 – 2026-11-18

- Server: a new layout of the page of the account. The cards are in one column in the middle.
  Each form has short fields and its button at the end of the fields, and the facts of the
  account and of the server are a list. **Log out** is at the top of the card of the account.
  The rights of an invite are one group, and the space is a short field in MB.
- Server: a click on an account opens its dialog: the rights, the limits, **Link for a new
  password**, and **Remove the account**. Before, these were icons in the row.
- The lists of links and versions have a line only between the rows, and the buttons of a row
  are together at its end.
- On the page of the account, **‹ Grundriss** shows on hover that it leads back to the plans.

## 0.6.3 – 2026-11-18

- Outdoor is a topic of its own, after Structure. It has the tools **Area** (A), **Fence** (G),
  and **Tree** (T) in place of the menu Outdoor, and its panel lists the areas, the fences, and
  the trees of the story. The overview opens them in this topic.

- 3D: without "All stories", a chimney stops at the top of the walls of the active story. Before,
  it went up through the hidden stories and the roof.

## 0.6.2 – 2026-11-18

- Structure: the tools of the outdoor parts are one menu **Outdoor**, like Water and Heating. It
  has the kinds of areas, the kinds of fences, and the tree, so the palette fits in one row
  again. The keys A, G, and T still start the tools.
- 2D: the corners of an area and the points of a fence snap to the corners and the faces of the
  walls, and to the corners and the sides of the other areas and fences. Shift keeps steps of
  45°, and Alt turns the snap off, also in the preview. Before, the preview ignored Shift and Alt.
- 2D: a click on the first point closes an area also when the snap moves the click, and a ring
  around the point shows it. A click on the first point of a fence closes it into a ring.
- 2D: the area, fence, tree, and measure tools have the cross cursor, and the cursor of a tool
  stays over the objects. Before, it changed to the cursor of a move over a selected area.
- 3D: without "All stories", the roof of the active story does not show, and the roofs of the
  lower stories show where they are not over the active story. Before, the upper story of a house
  with a low wing showed its own roof, and the roof of the wing was missing.
- Server: "Edit" and "View only" in the top bar are the same quiet button.

## 0.6.1 – 2026-11-18

- Server: in the app of a server, all plans are on the server. **New plan**, **Open a file**, and
  **Example house** make a plan on the server and open it, and the home page shows only the
  plans of the server. Plans that are still in the browser show as a link at the end, to move
  them to the server. The **+** of the server is gone, and so is "Copy or move to this browser";
  **Save as** still saves a file, and **Save a copy** makes a copy on the server.
- Server: the name of the account in the top bar, or **Log in**, opens the page of the account in
  place of the plans: the password and the logout, and for the admin the server, the accounts,
  the invites, and the share links. Before, these were dialogs behind icons of the home page.

- German: the error messages with a value, for example a status code or a file name, show in
  German too (Open-Meteo, Poly Haven, the import of a model, a package, the recognition).
- 2D: a drag of one of some selected roofs moves all of them, like the arrow keys.
- Server: the selection of another person shows also on an outdoor area, a corner of an area, a
  fence, and a tree.
- Phone: the status card is above the sheet of the panel, and above the Done button while it
  shows, so it covers no part of them.
- Server: an own change that the server saves after a send without an answer does not hide the
  newer own changes any more.
- The keyboard shortcuts and the comparison of the variants are dialogs like the others.

## 0.6.0 – 2026-11-18

- Server: a text in a plan cannot read a file of the server any more. Before, a person who could
  edit a plan could read other files of the server through a text that looked like a stored
  image.
- Server: logins that come at the same time all count for the limit of the logins. Behind a
  proxy, set `GRUNDRISS_TRUST_PROXY=true` (the `compose.yaml` does), so that the limit counts
  each address; without it, a client cannot give itself a new address with a header. A request
  without a plan can have at most 64 KB. A deleted plan also removes its files and the images
  that no other plan has. A server does not start with the data of a newer version.
- Server: the changes without the network move with the copy to each newer revision, so they
  never undo the changes of others. "Load again" drops them, and the log out asks first if
  changes did not go to the server yet; it also closes the open plan.
- 2D: a merge of walls where the first selected wall goes the other way does not break the plan
  any more. On the roof level, Ctrl+A selects only the roofs, and paste does nothing. Copy,
  paste, and duplicate work for outdoor areas, fences, and trees. The arrow keys move a selected
  corner of a roof or an area. A new plan opens on a story, not on the roof level.
- The groups of the panel stay open after a change. A click in a dialog closes it only outside
  of the dialog. An update of the app keeps the files of the version before, so an open page
  can still load the tracing.
- The PDF without furniture fits the page around the outdoor parts, and the DXF and the package
  name the outdoor areas in the language of the app.
- Server: a plan of a server opens without the network to edit, if you could edit it. The browser
  keeps your changes, also after the tab closes, and sends them when the server answers again;
  they merge with the changes of the others. A send that fails tries again by itself, and the
  Projects page marks a plan whose changes wait. Before, the copy was only to view.
- Server: a person who follows another one also follows onto the roof level, and the mark of a
  person names the roof level as the place.
- Outdoor: the new tools **Outdoor** (A), **Fence** (G), and **Tree** (T) in Structure. An outdoor
  area is a terrace, a balcony, a roof terrace, a path, a driveway, a lawn, a pool, the plot, or
  a neighbor building, with an outline, a height, and a thickness. Its corners drag like the
  corners of a roof, and a terrace or a balcony can have a railing on each side. A fence, a
  hedge, or a garden wall is a line with a height, and a tree has a crown and a height. All show
  in 2D and in 3D, and in the SVG, PDF, and DXF exports.
- PV: trees, neighbor buildings, hedges, fences, and garden walls shade the PV fields. A tree
  that loses its leaves shades only from May to October.
- Living area: a terrace, a balcony, and a roof terrace count with a quarter of their area
  (WoFlV), in the panel of the story, in the report, and in the new file `outdoor.csv`.
- Phone: the status is a small card above the tabs, with its whole text in more lines if
  needed. A message goes after some seconds, and an error stays until a tap. Before, it was one
  line that cut long texts, and it always took a row; now the panel reaches down to the tabs.
- The app has the look of the website: a floating top bar of glass, rounder panels with soft
  shadows, and the blue-to-violet gradient of the brand on the main buttons and on the active
  topic, view, tool, and story. The 3D view shows the building under a sky, on a disc of ground,
  in the light of a sun with soft shadows, in place of the grid. The dark theme has a night sky.
- 2D: **Roof** at the top of the list of the stories shows the roofs of all stories from above,
  with their faces, ridges, dormers, roof windows, and chimneys, and the walls of all stories as
  thin lines. A click selects a roof, and a drag or the arrow keys move it. A roof of a lower
  story, for example over a part of the ground floor, shows too, and a higher roof covers it. The
  panel lists the roofs of all stories, and adds a roof on the story that you choose. The 3D
  view shows the whole building. Before, a roof was only a row in the panel and dashed lines on
  its story.
- Server: accounts with a name and a password replace the links of the users and the root link.
  At the first start, the log shows a setup link for the admin, which works once. The admin
  invites people with invite links, which work once and end after 72 hours, and chooses their
  rights: make plans, see and edit all plans, and invite others. The admin makes a link for a
  new password; the server sends no emails. The login is a cookie that scripts cannot read.
- Server: each account has a space for its plans (500 MB) and a number of plans (100). A save
  over the space fails with a message. The admin changes both for each account, and the server
  sets the defaults (`GRUNDRISS_QUOTA_MB`, `GRUNDRISS_MAX_PLANS`).
- Server: a share link is now `/s/<token>`. It needs no account: the browser keeps the plan, and
  the Projects page shows it, also after a login. The app of the server is at `/app/`, and
  `/app/plans/<id>` opens a plan.
- Server: the website of the server shows "Log in", or the name of the account.
- Server: the app of a server talks only to its own server. The app on GitHub Pages has no
  server any more: "Connect a server", the mode `api`, `GRUNDRISS_ORIGINS`, `GRUNDRISS_APP_URL`,
  `GRUNDRISS_HOME_URL`, and `GRUNDRISS_ROOT_TOKEN` are gone. Move a plan as a file.
- Server: the old links of the users, the root link, and the old share links stop working. The
  plans stay, and go to the admin at the setup. The data of the server is now in `data.yaml`,
  which a person can read: at its next start, the server moves `data.json` to `data.yaml` and
  keeps the old file as `data.json.old`.
- Server: a logout removes the copies of the plans of the server from the browser.
- Phone: the mark of the server in the top bar shows only the cloud again, as before 0.5.2.

## 0.5.2 – 2026-11-17

- Server: on a phone, the mark of the server in the top bar shows the name of the server when the
  bar has room for it. Before, it showed only the cloud.

## 0.5.1 – 2026-11-17

- Editor: with more corners selected, the panel has one "Pinned" check box for all of them. If
  only some of them are pinned, the box shows a mixed state, and a click pins all of them.

## 0.5.0 – 2026-11-16

- Server: all people who can edit a plan now edit it at the same time. Each change goes to the
  others at once, and the changes of different people merge by object, so a wall that one person
  moves and a door that another person adds both stay. Undo takes back only your own changes.
  Before, only the first person could edit, and the others had to wait.
- Server: the top bar shows the other people on the plan. The 2D view shows their cursors and
  their selections. A click on a person follows that person: the story, the topic, the part of
  the plan, the 3D camera, and the selection. A person who can edit can switch to "View only".
- 3D: a drag turns the view around the point of the building under the cursor, or around the
  center of the building if the cursor is on empty space. Before, a drag that started on the
  ground far away moved the house out of the view. The camera stays above the ground, and a
  double click on empty space shows the whole building.
- 2D: a thick wall that meets a thinner wall does not stick out of it any more, at a T, at a
  corner, or where the wall goes on straight. The 2D drawing and the exports now use the same
  joins as the 3D view.
- 2D and 3D: where three or more walls meet, each wall meets the next wall around the joint in a
  clean miter. Before, each wall went on by half its thickness, so a thick wall stuck out.
- 2D: the new Measure tool (M) shows the distance between two points and does not change the
  plan, so it works also in a plan to view. Its points snap to the corners and the faces of the
  walls. The dimension lines have their own tool, Dimension (L), in Structure.
- 2D: a selected wall shows the length of each side from wall to wall, as a thin line along the
  face. The panel has the same lengths, and you can type each one. Before, the wall showed only
  its length from the middle of one joint to the middle of the other. A new length moves only the end of the wall.
- 2D: a corner can be pinned. A pinned corner stays in its place when a length changes, so the
  other end moves. A length with pinned corners at both ends cannot change, and the panel says
  why.
- 2D: walls in one straight line that are selected together show their lengths like one wall,
  with a chain of dimensions for the parts. Each part has its own length; a new length of a part
  moves the parts after it. If no other wall meets the line between its ends, the walls merge
  into one wall, with their doors and windows.
- Export: the PDF has options. "Inside lengths" adds dimension lines in each room along its
  walls, from wall to wall (once for each length and direction). "Outside lengths" adds the
  length of each facade outside. "Furniture" shows or hides the furniture.
- 2D: the panel of one or more walls has their direction: a small dial to drag and a field in
  degrees. "Straighten" turns them to the nearest of 0°, 90°, 180°, and 270°. More walls turn
  together, around a pinned corner or their middle.
- The length of a wall side at a small kink (up to 10°) ends at the kink. Before, if the two
  walls differed in thickness, the face went on up to 0.9 m beyond the kink, so the lengths were
  wrong and the dimension lines in the PDF lay on top of each other. The PDF also keeps only one
  of two dimension lines that lie on top of each other.
- 2D: "Align with the first wall" turns the selected walls parallel or at a right angle to the
  wall that was selected first. Each wall keeps its length, and a pinned corner stays.
- 2D: the ends of a dimension line snap to the corners and the faces of the walls, so an inside
  or outside length is exact. Where no wall is near, they snap to the grid as before.
- 2D: a wall splits into two walls with one click, in the middle or beside a door or a window
  there. A note of the wall stays with the first part.
- The top bar and the tool palette get shorter in steps until they fit, also with the longer
  German texts: first the keys and the labels go, then only the icons stay. The palette can use
  the full width of the 2D view, and in a narrow view it gets a second row, so each tool stays
  visible.

## 0.4.0 – 2026-11-09

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
- Panel: a list of objects (the roofs, the rooms, the collisions) shows a row for each object.
  A group that opens and closes has a flat header with an arrow, so it does not look like a
  button. Only the main action of a screen is a blue button. Renovation shows one heading less,
  and Compare is next to Variants.
- Dialogs: the main action is at the bottom right, next to Cancel. The dialog of a server plan
  has one main action, Edit, and Close.
- Safari: Open a file shows the file picker again. Before, Safari did not show it, for example
  from the first screen of a new plan.

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
