// The German texts of a part of the app: the shell (src/main.ts), the static texts of
// index.html, the tool hints, the keyboard shortcuts, the notes, the panel helpers, the furniture
// catalog, and the labels of the 2D editor. See src/i18n/index.ts.

export const APP: Record<string, string> = {
  // ----- index.html: the top bar -----
  "The name of the plan file": "Der Name der Plandatei",
  "Unsaved changes": "Ungespeicherte Änderungen",
  Topic: "Bereich",
  "The contents of the plan": "Der Inhalt des Plans",
  Overview: "Übersicht",
  "Background, walls, floors, and roofs": "Hintergrund, Wände, Geschosse und Dächer",
  Structure: "Gebäude",
  "Water, heating, electricity, and communication": "Wasser, Heizung, Elektro und Kommunikation",
  Utilities: "Haustechnik",
  "Furniture and rooms": "Möbel und Räume",
  Interior: "Einrichtung",
  "Insulation, heating energy, and heating costs": "Dämmung, Heizenergie und Heizkosten",
  Energy: "Energie",
  "Variants, measures, cost, and payback": "Varianten, Maßnahmen, Kosten und Amortisation",
  Renovation: "Sanierung",
  "New plan": "Neuer Plan",
  "Open a plan (Ctrl+O)": "Plan öffnen (Strg+O)",
  "Save (Ctrl+S)": "Speichern (Strg+S)",
  "Save as (Ctrl+Shift+S)": "Speichern unter (Strg+Umschalt+S)",
  "Change the language": "Sprache wechseln",
  "Install Grundriss as an app on this device. It then works without the internet.":
    "Grundriss als App auf diesem Gerät installieren. Sie funktioniert dann auch ohne Internet.",
  Install: "Installieren",
  Layers: "Ebenen",
  "Export the plan": "Plan exportieren",
  Export: "Exportieren",
  "Undo (Ctrl+Z)": "Rückgängig (Strg+Z)",
  "Redo (Ctrl+Shift+Z)": "Wiederholen (Strg+Umschalt+Z)",
  "More: files, layers, export, and help": "Mehr: Dateien, Ebenen, Export und Hilfe",
  More: "Mehr",
  View: "Ansicht",
  "2D only": "Nur 2D",
  "2D and 3D": "2D und 3D",
  Split: "Geteilt",
  "3D only": "Nur 3D",

  // ----- index.html: the tools -----
  Tools: "Werkzeuge",
  "Select and move (V)": "Auswählen und verschieben (V)",
  Select: "Auswählen",
  "Move the view (P, or hold Space)": "Ansicht verschieben (P oder Leertaste halten)",
  Pan: "Verschieben",
  "Draw a dimension line (M)": "Maßlinie zeichnen (M)",
  Measure: "Messen",
  "Load a scan or a photo of a plan": "Scan oder Foto eines Plans laden",
  Background: "Hintergrund",
  "Set the scale of the background (C)": "Maßstab des Hintergrunds festlegen (C)",
  Scale: "Maßstab",
  "Straighten a photo of a plan": "Foto eines Plans entzerren",
  Straighten: "Entzerren",
  "Draw walls (W)": "Wände zeichnen (W)",
  Wall: "Wand",
  "Put a door in a wall (D)": "Tür in eine Wand setzen (D)",
  Door: "Tür",
  "Put a window in a wall (N)": "Fenster in eine Wand setzen (N)",
  Window: "Fenster",
  "Draw a stair up to the next story (S)": "Treppe zum nächsten Geschoss zeichnen (S)",
  Stair: "Treppe",
  "Put a chimney (H)": "Kamin setzen (H)",
  Chimney: "Kamin",
  "Water pipes and outlets": "Wasserleitungen und Entnahmestellen",
  Water: "Wasser",
  "Heating pipes, radiators, and heat sources": "Heizleitungen, Heizkörper und Wärmeerzeuger",
  Heating: "Heizung",
  "Sockets, lights, cables, and PV (E)": "Steckdosen, Leuchten, Kabel und PV (E)",
  Electricity: "Elektro",
  "Network, phone, TV, and SAT": "Netzwerk, Telefon, TV und SAT",
  Communication: "Kommunikation",
  "Open the furniture catalog (I)": "Möbelkatalog öffnen (I)",
  Furniture: "Möbel",
  Stories: "Geschosse",
  Done: "Fertig",
  "North. Drag to turn it.": "Norden. Zum Drehen ziehen.",
  "Fit the plan in the view (F)": "Plan in die Ansicht einpassen (F)",
  "3D · drag to orbit, scroll to zoom": "3D · Ziehen zum Drehen, Scrollen zum Zoomen",
  "Show the stories above the active story": "Die Geschosse über dem aktiven Geschoss zeigen",
  "All stories": "Alle Geschosse",
  "Show more or less of the panel": "Mehr oder weniger vom Seitenbereich zeigen",

  // ----- index.html: the start card, the projects, and the overview -----
  "Start a floor plan": "Einen Grundriss beginnen",
  // translatePage looks up the trimmed text node with its inner line break, so this key keeps
  // the line break and the indent of index.html.
  "Open a saved plan, load a scan or a photo of a plan and trace it, or draw the walls on the grid.":
    "Öffnen Sie einen gespeicherten Plan, laden Sie einen Scan oder ein Foto eines Plans und zeichnen Sie ihn nach, oder zeichnen Sie die Wände auf dem Raster.",
  "Open a plan": "Plan öffnen",
  "Load background": "Hintergrund laden",
  "Draw walls": "Wände zeichnen",
  "Or open the example house": "Oder das Beispielhaus öffnen",
  Projects: "Projekte",
  Contents: "Inhalt",

  // ----- index.html: the menus -----
  Save: "Speichern",
  "Save as": "Speichern unter",
  "Keyboard shortcuts": "Tastenkürzel",
  "This topic": "Dieser Bereich",
  Photovoltaic: "Photovoltaik",
  "Insulation and heat loss": "Dämmung und Heizlast",
  "Under the 2D plan": "Unter dem 2D-Plan",
  "Background image": "Hintergrundbild",
  "No map": "Keine Karte",
  "Map (OpenStreetMap)": "Karte (OpenStreetMap)",
  "Aerial photo (Austria)": "Luftbild (Österreich)",
  // The same line break as above.
  "The map needs a location. It loads from the internet, so it sends the place to the map server.":
    "Die Karte braucht einen Standort. Sie wird aus dem Internet geladen und sendet den Standort daher an den Kartenserver.",
  "Story on top": "Geschoss oben",
  "A full story above the highest story": "Ein Vollgeschoss über dem obersten Geschoss",
  Attic: "Dachgeschoss",
  "A story with low knee walls under the roof":
    "Ein Geschoss mit niedrigem Kniestock unter dem Dach",
  Cellar: "Keller",
  "A story under the lowest story": "Ein Geschoss unter dem untersten Geschoss",
  "Print at a standard scale": "Druck in einem Normmaßstab",
  "Vector drawing in meters": "Vektorzeichnung in Metern",
  "For CAD programs": "Für CAD-Programme",
  "3D model": "3D-Modell",
  "Report (PDF)": "Bericht (PDF)",
  "Areas, energy, renovation, and the plans": "Flächen, Energie, Sanierung und die Pläne",
  "Quantities (CSV)": "Mengen (CSV)",
  "Rooms, openings, envelope, materials, services":
    "Räume, Öffnungen, Gebäudehülle, Materialien, Haustechnik",

  // ----- src/ui/context.ts: the hints of the tools -----
  "Click to select, Shift+click to add. Click in a room to name it or to set its height. Drag on the empty plan to select in a box. Drag a wall to move it: the next walls keep their angles (Shift: free). Pan: two-finger scroll, Space+drag, or right drag.":
    "Klicken zum Auswählen, Umschalt+Klick zum Hinzufügen. Klicken Sie in einen Raum, um ihn zu benennen oder seine Höhe festzulegen. Ziehen Sie auf dem leeren Plan, um mit einem Rechteck auszuwählen. Ziehen Sie eine Wand, um sie zu verschieben: Die angrenzenden Wände behalten ihre Winkel (Umschalt: frei). Ansicht verschieben: mit zwei Fingern scrollen, Leertaste+Ziehen oder mit der rechten Maustaste ziehen.",
  "Drag to move the view. The wheel or a pinch zooms. V goes back to Select. In other tools, hold Space and drag, or drag with the right button.":
    "Ziehen Sie, um die Ansicht zu verschieben. Mausrad oder Zwei-Finger-Geste zoomt. V wechselt zurück zu Auswählen. In anderen Werkzeugen halten Sie die Leertaste und ziehen, oder Sie ziehen mit der rechten Maustaste.",
  "Click to add corners. A click on a corner or a wall ends the chain. The direction snaps to 15°. Shift: 45° steps. Alt: free. Esc: stop.":
    "Klicken Sie, um Ecken zu setzen. Ein Klick auf eine Ecke oder eine Wand beendet den Wandzug. Die Richtung rastet in 15°-Schritten ein. Umschalt: 45°-Schritte. Alt: frei. Esc: beenden.",
  "Click on a wall to put a door in it.": "Klicken Sie auf eine Wand, um eine Tür einzusetzen.",
  "Click on a wall to put a window in it.":
    "Klicken Sie auf eine Wand, um ein Fenster einzusetzen.",
  "Click the two ends of the distance, then click where the dimension line goes. Shift: 45° steps. Alt: no grid.":
    "Klicken Sie auf die beiden Enden der Strecke und dann dorthin, wo die Maßlinie liegen soll. Umschalt: 45°-Schritte. Alt: ohne Raster.",
  "Click the bottom of the stair, then the top of its run. The stair goes up to the next story.":
    "Klicken Sie auf den Antritt der Treppe und dann auf das obere Ende des Laufs. Die Treppe führt zum nächsten Geschoss.",
  "Click to place the device. A device for a wall goes against the nearest wall. Alt: no snap. Esc: stop.":
    "Klicken Sie, um das Gerät zu platzieren. Ein Wandgerät kommt an die nächste Wand. Alt: ohne Einrasten. Esc: beenden.",
  "Click the points of the line. A click on a device ends the line there. Double click or Enter: end. Esc: stop.":
    "Klicken Sie auf die Punkte der Leitung. Ein Klick auf ein Gerät beendet die Leitung dort. Doppelklick oder Eingabetaste: abschließen. Esc: beenden.",
  "Click to place the piece. Near a wall, its back goes against the wall. R: turn by 90°, Shift+R: by 15°. Shift+click: place more. Alt: no snap. Esc: stop.":
    "Klicken Sie, um das Möbelstück zu platzieren. Nahe einer Wand kommt seine Rückseite an die Wand. R: um 90° drehen, Umschalt+R: um 15°. Umschalt+Klick: weitere platzieren. Alt: ohne Einrasten. Esc: beenden.",
  "Click where the chimney goes. It goes up through the stories above and the roof.":
    "Klicken Sie dorthin, wo der Kamin stehen soll. Er führt durch die Geschosse darüber und das Dach.",
  "Click two points on the background with a known distance between them.":
    "Klicken Sie auf zwei Punkte im Hintergrund, deren Abstand Sie kennen.",
  "Click the four corners of the plan on the background, in any order. Esc: stop.":
    "Klicken Sie auf die vier Ecken des Plans im Hintergrund, in beliebiger Reihenfolge. Esc: beenden.",
  "Drag to move the map under the plan. Shift+drag turns the map around the place. Esc: done.":
    "Ziehen Sie, um die Karte unter dem Plan zu verschieben. Umschalt+Ziehen dreht die Karte um den Standort. Esc: fertig.",

  // ----- src/main.ts -----
  "Click a plan to open it, or start a new plan.":
    "Klicken Sie auf einen Plan, um ihn zu öffnen, oder beginnen Sie einen neuen Plan.",
  "Click a part of the plan to open it in its topic.":
    "Klicken Sie auf einen Teil des Plans, um ihn in seinem Bereich zu öffnen.",
  "Close the plan and show the projects. The plan is already saved in the browser.":
    "Plan schließen und die Projekte zeigen. Der Plan ist bereits im Browser gespeichert.",
  "Straightening the image…": "Das Bild wird entzerrt…",
  "The image is straight. Its size changed, so set the scale again.":
    "Das Bild ist entzerrt. Seine Größe hat sich geändert, legen Sie daher den Maßstab erneut fest.",
  "{name}: floor at {elevation} m": "{name}: Fußboden auf {elevation} m",
  "Add story": "Geschoss hinzufügen",
  "Added a cellar. The walls of the story above show as dashed lines.":
    "Keller hinzugefügt. Die Wände des Geschosses darüber erscheinen strichliert.",
  "Added a story. The walls of the story below show as dashed lines.":
    "Geschoss hinzugefügt. Die Wände des Geschosses darunter erscheinen strichliert.",
  "Placed {name}. R turns it, and a drag moves it.":
    "{name} platziert. R dreht es, Ziehen verschiebt es.",
  "Saved {name}.": "{name} gespeichert.",
  "Exported {name}.": "{name} exportiert.",
  "Grundriss report": "Grundriss-Bericht",
  "{name} report.pdf": "{name} Bericht.pdf",
  "{name} quantities.zip": "{name} Mengen.zip",
  "ZIP archive": "ZIP-Archiv",
  "The image is now {width} × {height} pixels, so that the plan stays fast. Click two points with a known distance.":
    "Das Bild hat jetzt {width} × {height} Pixel, damit der Plan schnell bleibt. Klicken Sie auf zwei Punkte mit bekanntem Abstand.",
  "The browser cannot read this image.": "Der Browser kann dieses Bild nicht lesen.",
  "Added the line. Draw the next line, or press Esc to stop.":
    "Leitung hinzugefügt. Zeichnen Sie die nächste Leitung, oder drücken Sie Esc zum Beenden.",
  "Installed Grundriss. It opens from your apps, also without the internet.":
    "Grundriss ist installiert. Sie öffnen es über Ihre Apps, auch ohne Internet.",
  "Opened {name}.": "{name} geöffnet.",
  "A new version of Grundriss is ready. Reload the page to use it.":
    "Eine neue Version von Grundriss ist bereit. Laden Sie die Seite neu, um sie zu verwenden.",

  // ----- src/main.ts: the headers and the words of the quantities (CSV) -----
  Story: "Geschoss",
  Room: "Raum",
  "Net area m²": "Nettofläche m²",
  "Living area m²": "Wohnfläche m²",
  "Area on center lines m²": "Fläche auf Achsmaßen m²",
  "Height m": "Höhe m",
  "Perimeter m": "Umfang m",
  Heated: "Beheizt",
  Kind: "Art",
  "Width m": "Breite m",
  "Sill m": "Brüstungshöhe m",
  Count: "Anzahl",
  "Area m²": "Fläche m²",
  Part: "Bauteil",
  Material: "Material",
  "Thickness m": "Dicke m",
  "Volume m³": "Volumen m³",
  Quantity: "Menge",
  Unit: "Einheit",
  yes: "ja",
  no: "nein",
  "Outer walls without openings": "Außenwände ohne Öffnungen",
  Windows: "Fenster",
  Roof: "Dach",
  "Floor on the ground": "Boden gegen Erdreich",
  "Slabs to unheated stories": "Decken zu unbeheizten Geschossen",
  "Gross floor area": "Bruttogrundfläche",
  "Net floor area": "Nettogrundfläche",
  "Heated volume": "Beheiztes Volumen",
  "Outer walls": "Außenwände",

  // ----- src/ui/shortcuts.ts -----
  Edit: "Bearbeiten",
  "Set the scale": "Maßstab festlegen",
  Undo: "Rückgängig",
  Redo: "Wiederholen",
  "Copy, cut, paste": "Kopieren, ausschneiden, einfügen",
  Duplicate: "Duplizieren",
  "Select all": "Alles auswählen",
  "Delete the selection": "Auswahl löschen",
  "Move 5 cm (Shift: 50 cm)": "5 cm verschieben (Umschalt: 50 cm)",
  "Turn by 90° (Shift: 15°)": "Um 90° drehen (Umschalt: 15°)",
  "Stop the tool": "Werkzeug beenden",
  "End a line": "Leitung abschließen",
  "View and file": "Ansicht und Datei",
  "Fit the plan": "Plan einpassen",
  "Save (Shift: save as)": "Speichern (Umschalt: speichern unter)",
  "Open a file": "Datei öffnen",
  "This help": "Diese Hilfe",
  Close: "Schließen",
  or: "oder",
  // The names of the keys on a German keyboard. The keys have the suffix " key", so that they do
  // not collide with words such as "Delete" in other parts of the dictionary.
  "Ctrl key": "Strg",
  "Shift key": "Umschalt",
  "Space key": "Leertaste",
  "drag key": "Ziehen",
  "Delete key": "Entf",
  "Arrows key": "Pfeiltasten",
  "Enter key": "Eingabe",

  // ----- src/ui/notes.ts -----
  "Notes and photos · {count}": "Notizen und Fotos · {count}",
  "Notes and photos": "Notizen und Fotos",
  "For example: damp in the corner, window from 1985":
    "Zum Beispiel: Feuchtigkeit in der Ecke, Fenster von 1985",
  Note: "Notiz",
  "Photo {number}": "Foto {number}",
  "Remove the photo": "Foto entfernen",
  "+ Photo": "+ Foto",
  "For example F3": "Zum Beispiel F3",
  Circuit: "Stromkreis",

  // ----- src/ui/panel.ts -----
  "Thickness in cm": "Dicke in cm",
  "Remove the layer": "Schicht entfernen",
  "From the inside to the outside. U = {u} W/(m²K), {thickness} cm.":
    "Von innen nach außen. U = {u} W/(m²K), {thickness} cm.",
  "Add a layer": "Schicht hinzufügen",
  "Heat demand per month: {months}": "Heizwärmebedarf pro Monat: {months}",
  "Heat demand per month, kWh": "Heizwärmebedarf pro Monat, kWh",

  // ----- src/ui/catalog.ts -----
  "Close (Esc)": "Schließen (Esc)",
  Generic: "Allgemein",
  Imported: "Importiert",
  Search: "Suchen",
  "Loading the Kenney kit…": "Das Kenney-Set wird geladen…",
  "Kenney Furniture Kit, CC0 1.0 (kenney.nl).": "Kenney Furniture Kit, CC0 1.0 (kenney.nl).",
  "Loading the furniture of Poly Haven… The app asks polyhaven.com for the list.":
    "Die Möbel von Poly Haven werden geladen… Die App fragt die Liste bei polyhaven.com ab.",
  "Realistic models from polyhaven.com, CC0 1.0. A click downloads the model with 1k textures (a few MB). The plan file then contains it.":
    "Realistische Modelle von polyhaven.com, CC0 1.0. Ein Klick lädt das Modell mit 1k-Texturen herunter (einige MB). Die Plandatei enthält es dann.",
  "Downloading {name} from Poly Haven…": "{name} wird von Poly Haven heruntergeladen…",
  "Downloaded {name}. Click on the plan to place it.":
    "{name} heruntergeladen. Klicken Sie in den Plan, um es zu platzieren.",
  "Import a model (.glb, .gltf)": "Modell importieren (.glb, .gltf)",
  "The plan has no models yet. Import a model, or use one from Kenney or Poly Haven.":
    "Der Plan hat noch keine Modelle. Importieren Sie ein Modell, oder verwenden Sie eines von Kenney oder Poly Haven.",
  "Models in this plan": "Modelle in diesem Plan",
  "Reading {name}…": "{name} wird gelesen…",
  "Imported {name}. Click on the plan to place it.":
    "{name} importiert. Klicken Sie in den Plan, um es zu platzieren.",
  "Nothing matches the search.": "Keine Treffer für die Suche.",
  // The static errors of src/furniture/, which the catalog shows.
  "Choose a .glb or a .gltf file.": "Wählen Sie eine .glb- oder .gltf-Datei.",
  "The .gltf file is not valid JSON.": "Die .gltf-Datei ist kein gültiges JSON.",
  "The model has no geometry.": "Das Modell hat keine Geometrie.",
  "The app cannot reach Poly Haven. Check the network connection.":
    "Die App erreicht Poly Haven nicht. Prüfen Sie die Netzwerkverbindung.",

  // ----- src/editor/editor2d.ts -----
  "{count} steps · {height} cm": "{count} Stufen · {height} cm",
  "Plan, check, and renovate your house": "Planen, prüfen und sanieren Sie Ihr Haus",
};
