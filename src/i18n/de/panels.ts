// The German texts of a part of the app. See src/i18n/index.ts.
// This part: the panels of the selected objects (src/ui/selection.ts), the background, the
// stories, the building, and the roofs (src/ui/structure.ts), the assisted tracing
// (src/ui/tracing.ts), and the Overview tree (src/ui/contents.ts).

export const PANELS: Record<string, string> = {
  // selection.ts: the scale of the background.
  "Set the scale": "Maßstab festlegen",
  "Load a background first.": "Laden Sie zuerst einen Hintergrund.",
  "Load background": "Hintergrund laden",
  "Click two points on the background, for example the ends of a known wall.":
    "Klicken Sie auf zwei Punkte im Hintergrund, zum Beispiel auf die Enden einer bekannten Wand.",
  "The line is {length} m long at the current scale.":
    "Die Linie ist beim aktuellen Maßstab {length} m lang.",
  "Real length": "Tatsächliche Länge",
  Apply: "Übernehmen",
  "The scale of the background is set. Now draw the walls on it.":
    "Der Maßstab des Hintergrunds ist festgelegt. Zeichnen Sie jetzt die Wände darauf.",

  // selection.ts: a selection of more than one object.
  Selection: "Auswahl",
  wall: "Wand",
  walls: "Wände",
  opening: "Öffnung",
  openings: "Öffnungen",
  dimension: "Bemaßung",
  dimensions: "Bemaßungen",
  corner: "Ecke",
  corners: "Ecken",
  stair: "Treppe",
  stairs: "Treppen",
  chimney: "Kamin",
  chimneys: "Kamine",
  room: "Raum",
  rooms: "Räume",
  furniture: "Möbel",
  device: "Gerät",
  devices: "Geräte",
  line: "Leitung",
  lines: "Leitungen",
  roof: "Dach",
  roofs: "Dächer",
  "roof corner": "Dachecke",
  "roof corners": "Dachecken",
  "Drag the selection or use the arrow keys to move it.":
    "Ziehen Sie die Auswahl, oder verschieben Sie sie mit den Pfeiltasten.",
  Duplicate: "Duplizieren",
  Delete: "Löschen",

  // selection.ts: a dimension.
  Dimension: "Bemaßung",
  length: "Länge",
  Offset: "Abstand",
  "Drag the dimension line to change its offset.":
    "Ziehen Sie die Maßlinie, um ihren Abstand zu ändern.",

  // selection.ts: a room.
  Room: "Raum",
  "area inside the walls": "Fläche innerhalb der Wände",
  "clear height": "lichte Höhe",
  Name: "Name",
  "For example Kitchen": "Zum Beispiel Küche",
  Height: "Höhe",
  "The room has the clear height of the story: {height} m. Type a height for a lowered ceiling or a high room.":
    "Der Raum hat die lichte Höhe des Geschosses: {height} m. Geben Sie eine Höhe für eine abgehängte Decke oder einen hohen Raum ein.",
  "The room has its own height. The 3D view shows its ceiling.":
    "Der Raum hat eine eigene Höhe. Die 3D-Ansicht zeigt seine Decke.",
  "Height of the story": "Höhe des Geschosses",
  "Wall color": "Wandfarbe",
  "Default color": "Standardfarbe",
  Heating: "Heizung",
  "{story} is unheated, so its rooms lose no heat. Make it heated in the panel of the story or in Energy.":
    "{story} ist unbeheizt, daher verlieren seine Räume keine Wärme. Machen Sie es im Bereich des Geschosses oder unter Energie beheizt.",
  "Floor heating": "Fußbodenheizung",
  Temperature: "Temperatur",
  "heat loss": "Heizlast",
  "per area": "pro Fläche",
  "heating power at 75/65 °C": "Heizleistung bei 75/65 °C",
  "good for a heat pump": "gut für eine Wärmepumpe",
  "fair for a heat pump": "ausreichend für eine Wärmepumpe",
  "too small for a heat pump": "zu klein für eine Wärmepumpe",
  "The heating of the room does not give its heat loss, even at a flow of 75 °C.":
    "Die Heizung des Raums deckt seine Heizlast nicht, auch nicht bei einer Vorlauftemperatur von 75 °C.",
  "The heating of the room needs a flow of {flow} °C: {verdict}.":
    "Die Heizung des Raums braucht eine Vorlauftemperatur von {flow} °C: {verdict}.",
  "Summer: {hours} hours over 27 °C, at most {max} °C: too hot. Use external blinds, or smaller windows to the south and the west.":
    "Sommer: {hours} Stunden über 27 °C, höchstens {max} °C: zu heiß. Verwenden Sie Außenjalousien oder kleinere Fenster nach Süden und Westen.",
  "Summer: {hours} hours over 27 °C, at most {max} °C: warm.":
    "Sommer: {hours} Stunden über 27 °C, höchstens {max} °C: warm.",
  "Summer: {hours} hours over 27 °C, at most {max} °C.":
    "Sommer: {hours} Stunden über 27 °C, höchstens {max} °C.",
  windows: "Fenster",
  doors: "Türen",
  floor: "Boden",
  ceiling: "Decke",
  "thermal bridges": "Wärmebrücken",
  ventilation: "Lüftung",
  "Floor heating: about {power} W and {pipe} m of pipe.":
    "Fußbodenheizung: etwa {power} W und {pipe} m Rohr.",
  "The heating power is {power} W too low. Add a radiator, or use floor heating.":
    "Die Heizleistung ist um {power} W zu niedrig. Fügen Sie einen Heizkörper hinzu, oder verwenden Sie eine Fußbodenheizung.",

  // selection.ts: a device and a line of the utilities.
  Label: "Bezeichnung",
  "For example K1": "Zum Beispiel K1",
  Width: "Breite",
  Power: "Leistung",
  Rotation: "Drehung",
  "The height is the height of the center above the floor.":
    "Die Höhe ist die Höhe der Mitte über dem Boden.",
  "length on the plan": "Länge im Plan",
  points: "Punkte",
  Kind: "Art",

  // selection.ts: a piece of furniture.
  Furniture: "Möbel",
  Depth: "Tiefe",
  "Above floor": "Über dem Boden",
  "Imported model": "Importiertes Modell",
  "Turn 90°": "Um 90° drehen",
  "Usual size": "Übliche Größe",

  // selection.ts: a stair.
  Stair: "Treppe",
  steps: "Stufen",
  "step height": "Stufenhöhe",
  "step depth": "Auftrittstiefe",
  Run: "Lauflänge",
  Shape: "Form",
  Straight: "Gerade",
  "L (quarter turn)": "L (viertelgewendelt)",
  "U (half turn)": "U (halbgewendelt)",
  Turn: "Richtung",
  "To the right": "Nach rechts",
  "To the left": "Nach links",
  "Second run": "Zweite Lauflänge",
  "The stair goes up to the floor of the next story. The run is the first flight. The landing counts as one step.":
    "Die Treppe führt bis zum Fußboden des nächsten Geschosses. Die Lauflänge ist der erste Lauf. Das Podest zählt als eine Stufe.",
  "Turn around": "Umkehren",

  // selection.ts: a chimney.
  Chimney: "Kamin",
  Top: "Oberkante",
  "The top is automatic: 0.8 m above the roof. Type a height to fix it.":
    "Die Oberkante ist automatisch: 0,8 m über dem Dach. Geben Sie eine Höhe ein, um sie festzulegen.",
  "The top is fixed. The height is above the ground.":
    "Die Oberkante ist festgelegt. Die Höhe gilt über dem Gelände.",
  "Automatic top": "Automatische Oberkante",

  // selection.ts: a wall.
  Wall: "Wand",
  Length: "Länge",
  Thickness: "Dicke",
  "Side to {name}": "Seite zu {name}",
  "Side to the room": "Seite zum Raum",
  Outside: "Außen",
  "Color of the room": "Farbe des Raums",
  "Color of the facade": "Farbe der Fassade",
  Insulation: "Dämmung",
  Outer: "Außen",
  Inner: "Innen",
  "U-value W/(m²K)": "U-Wert W/(m²K)",
  "An inner wall between two rooms does not lose heat.":
    "Eine Innenwand zwischen zwei Räumen verliert keine Wärme.",
  "The wall has the layers of the outer walls of the building.":
    "Die Wand hat die Schichten der Außenwände des Gebäudes.",
  "Own layers": "Eigene Schichten",
  "Layers of the building": "Schichten des Gebäudes",
  "Delete wall": "Wand löschen",

  // selection.ts: a door or a window, and a corner.
  Door: "Tür",
  Window: "Fenster",
  Sill: "Brüstungshöhe",
  Position: "Position",
  "Flip hinge": "Anschlag wechseln",
  "Flip swing": "Öffnungsrichtung wechseln",
  Opens: "Öffnungsart",
  Collisions: "Kollisionen",
  Overlap: "Überschneidung",
  "In the way of the leaf": "Im Schwenkbereich des Flügels",
  "Goes into the corner of the wall": "Reicht in die Ecke der Wand",
  "Higher than the wall": "Höher als die Wand",
  "Hinged leaf": "Drehflügel",
  Casement: "Dreh- oder Drehkippflügel",
  Sliding: "Schiebeflügel",
  "No leaf": "Ohne Türblatt (Durchgang)",
  "Fixed glazing": "Festverglasung",
  Leaves: "Flügel",
  "One leaf": "Einflügelig",
  "Two leaves": "Zweiflügelig",
  "One casement": "Einflügelig",
  "Two casements": "Zweiflügelig",
  "Slide to the other side": "Schieberichtung wechseln",
  "Other face of the wall": "Auf die andere Wandseite",
  Corner: "Ecke",
  "Delete corner": "Ecke löschen",

  // structure.ts: the background and the assisted tracing.
  Background: "Hintergrund",
  Opacity: "Deckkraft",
  "Set scale": "Maßstab festlegen",
  Remove: "Entfernen",
  "Assisted tracing": "Unterstütztes Nachzeichnen",
  "These steps load OpenCV (about 10 MB) the first time.":
    "Diese Schritte laden beim ersten Mal OpenCV (etwa 10 MB).",
  Straighten: "Entzerren",
  "Clean-up strength": "Stärke der Bereinigung",
  "Clean up": "Bereinigen",
  "Suggest walls": "Wände vorschlagen",
  "Recognize plan": "Plan erkennen",
  "Recognize plan finds walls, doors, and windows with a neural network that runs in the browser. It needs about 15 MB the first time.":
    "„Plan erkennen“ findet Wände, Türen und Fenster mit einem neuronalen Netz, das im Browser läuft. Beim ersten Mal lädt es etwa 15 MB.",
  "Load a scan or a photo of a plan as the background, and draw the walls on it.":
    "Laden Sie einen Scan oder ein Foto eines Plans als Hintergrund, und zeichnen Sie die Wände darauf.",

  // structure.ts: the plan, the living area, and the story.
  Plan: "Plan",
  area: "Fläche",
  "The area is inside the center lines of the walls.":
    "Die Fläche liegt innerhalb der Mittellinien der Wände.",
  "{living} m² of {floor} m²": "{living} m² von {floor} m²",
  "living area (WoFlV)": "Wohnfläche (WoFlV)",
  "The roof is over the room. {full} m² have a clear height of 2 m or more and count fully. {half} m² have 1 m to 2 m and count half. The area under 1 m does not count. The 2D editor shows the lines of 1 m and 2 m.":
    "Das Dach liegt über dem Raum. {full} m² haben eine lichte Höhe von 2 m oder mehr und zählen voll. {half} m² haben 1 m bis 2 m und zählen zur Hälfte. Die Fläche unter 1 m zählt nicht. Der 2D-Editor zeigt die Linien für 1 m und 2 m.",
  Story: "Geschoss",
  "Floor level": "Fußbodenhöhe",
  "Story height": "Geschosshöhe",
  Heated: "Beheizt",
  "Delete story": "Geschoss löschen",

  // structure.ts: the building and the roofs.
  Building: "Gebäude",
  North: "Norden",
  Facade: "Fassade",
  Roofs: "Dächer",
  "No story": "Kein Geschoss",
  "Add a roof on the walls of {story}. Then click it to change its sides, its outline, and its dormers.":
    "Fügen Sie ein Dach auf die Wände von {story} hinzu. Klicken Sie es dann an, um seine Seiten, seinen Umriss und seine Gauben zu ändern.",
  Gable: "Giebel",
  "Half hip": "Krüppelwalm",
  "Gable roof": "Satteldach",
  "Half-hip roof": "Krüppelwalmdach",
  "Hip roof": "Walmdach",
  "Shed roof": "Pultdach",
  "Flat roof": "Flachdach",
  "The walls of this story close no outline, so the roof has no outline yet.":
    "Die Wände dieses Geschosses bilden keinen geschlossenen Umriss, daher hat das Dach noch keinen Umriss.",
  "Added the roof. Drag its corners, or drag a + to add a corner.":
    "Das Dach ist hinzugefügt. Ziehen Sie seine Ecken, oder ziehen Sie ein +, um eine Ecke hinzuzufügen.",
  "{roof} · corner {corner}": "{roof} · Ecke {corner}",
  "Drag the corner on the plan. Delete removes it.":
    "Ziehen Sie die Ecke im Plan. Entf entfernt sie.",
  "Whole roof": "Ganzes Dach",
  "top above ground": "First über Gelände",
  sides: "Seiten",
  Color: "Farbe",
  Underside: "Unterseite",
  "On story": "Auf Geschoss",
  "Eave height": "Traufhöhe",
  "Usual eave height": "Übliche Traufhöhe",
  "Presets for all sides:": "Vorlagen für alle Seiten:",
  "Outline from the walls": "Umriss aus den Wänden",
  "The walls of the story close no outline.":
    "Die Wände des Geschosses bilden keinen geschlossenen Umriss.",
  Sides: "Seiten",
  Eave: "Traufe",
  "Pitch in degrees": "Neigung in Grad",
  "Kind of side {side}": "Art der Seite {side}",
  "Overhang in meters": "Dachüberstand in Metern",
  "Side {side}: gable wall": "Seite {side}: Giebelwand",
  "Each row: the kind, the pitch in °, and the overhang in m. A half-hip side has a gable wall up to its height, and a small hip face above it.":
    "Jede Zeile: die Art, die Neigung in ° und der Dachüberstand in m. Eine Krüppelwalm-Seite hat eine Giebelwand bis zu ihrer Höhe und darüber eine kleine Walmfläche.",
  "It does not fit on the roof face of its side, so the 3D view does not show it. Move it nearer to the eave, or make it smaller.":
    "Sie passt nicht auf die Dachfläche ihrer Seite, daher zeigt die 3D-Ansicht sie nicht. Verschieben Sie sie näher zur Traufe, oder machen Sie sie kleiner.",
  "Dormers · {count}": "Gauben · {count}",
  "Dormer on side {side}": "Gaube auf Seite {side}",
  Side: "Seite",
  "Side {side}": "Seite {side}",
  "From eave": "Abstand zur Traufe",
  "Wall height": "Wandhöhe",
  Pitch: "Neigung",
  "Add a dormer": "Gaube hinzufügen",
  "Roof windows · {count}": "Dachfenster · {count}",
  "Window on side {side}": "Fenster auf Seite {side}",
  "Add a roof window": "Dachfenster hinzufügen",
  "Drag the corners of the outline on the plan. Drag a + to add a corner.":
    "Ziehen Sie die Ecken des Umrisses im Plan. Ziehen Sie ein +, um eine Ecke hinzuzufügen.",
  "Delete roof": "Dach löschen",
  // The kinds of a dormer.
  Shed: "Pultdach",
  Flat: "Flachdach",

  // tracing.ts: the assisted tracing.
  "Cleaning the image…": "Bild wird bereinigt …",
  "The image is clean. Undo brings back the old image.":
    "Das Bild ist bereinigt. „Rückgängig“ stellt das alte Bild wieder her.",
  "Finding walls…": "Wände werden gesucht …",
  "The app found no walls. Clean the image first, or draw the walls by hand.":
    "Die App hat keine Wände gefunden. Bereinigen Sie zuerst das Bild, oder zeichnen Sie die Wände von Hand.",
  "Click a suggested wall to reject it or to accept it again. Then add the walls.":
    "Klicken Sie auf eine vorgeschlagene Wand, um sie abzulehnen oder wieder anzunehmen. Fügen Sie dann die Wände hinzu.",
  "Added {walls} walls and {openings} doors and windows. Check them, and correct them where necessary.":
    "{walls} Wände und {openings} Türen und Fenster hinzugefügt. Prüfen Sie sie, und korrigieren Sie sie, wo nötig.",
  "Added {walls} walls. Check them, and correct them where necessary.":
    "{walls} Wände hinzugefügt. Prüfen Sie sie, und korrigieren Sie sie, wo nötig.",
  "Loading the recognition (about 15 MB the first time)…":
    "Erkennung wird geladen (beim ersten Mal etwa 15 MB) …",
  "Recognizing the plan: part {done} of {total}…": "Plan wird erkannt: Teil {done} von {total} …",
  "Finding the walls…": "Wände werden gesucht …",
  "The model found no walls. Straighten and clean the image, then try again.":
    "Das Modell hat keine Wände gefunden. Entzerren und bereinigen Sie das Bild, und versuchen Sie es dann erneut.",
  "Click a suggested wall, door, or window to reject it or to accept it again. Then add them.":
    "Klicken Sie auf eine vorgeschlagene Wand, Tür oder ein Fenster, um sie abzulehnen oder wieder anzunehmen. Fügen Sie sie dann hinzu.",
  "Recognized plan": "Erkannter Plan",
  "Suggested walls": "Vorgeschlagene Wände",
  rejected: "abgelehnt",
  "Click a suggestion on the plan to reject it, or to accept it again. Doors are orange, windows are blue.":
    "Klicken Sie auf einen Vorschlag im Plan, um ihn abzulehnen oder wieder anzunehmen. Türen sind orange, Fenster blau.",
  "Add {count} walls": "{count} Wände hinzufügen",
  Discard: "Verwerfen",
  "Straighten the image": "Bild entzerren",
  "Click the four corners of the plan on the background. The app corrects the perspective of the photo, so that the plan becomes a rectangle.":
    "Klicken Sie auf die vier Ecken des Plans im Hintergrund. Die App korrigiert die Perspektive des Fotos, sodass der Plan ein Rechteck wird.",
  Cancel: "Abbrechen",

  // contents.ts: the Overview tree.
  "{name} · {count} story": "{name} · {count} Geschoss",
  "{name} · {count} stories": "{name} · {count} Geschosse",
  Rooms: "Räume",
  Walls: "Wände",
  Doors: "Türen",
  Windows: "Fenster",
  Stairs: "Treppen",
  Chimneys: "Kamine",
  Dimensions: "Bemaßungen",
  "Background image": "Hintergrundbild",
  Piece: "Möbelstück",
  "{count} device": "{count} Gerät",
  "{count} devices": "{count} Geräte",
  "{count} line": "{count} Leitung",
  "{count} lines": "{count} Leitungen",
  Empty: "Leer",
  "on {story}": "im {story}",
  Photovoltaic: "Photovoltaik",
  "{count} field, {peak} kWp": "{count} Feld, {peak} kWp",
  "{count} fields, {peak} kWp": "{count} Felder, {peak} kWp",
  "3D models": "3D-Modelle",
  Location: "Standort",
  "{latitude}, {longitude}": "{latitude}; {longitude}",
  "not set": "nicht festgelegt",
  Climate: "Klima",
  "{first} to {last}": "{first} bis {last}",
  "not loaded": "nicht geladen",
};
