// The German texts of a part of the app. See src/i18n/index.ts.
//
// The names and the messages of the model and of the I/O modules. These modules do not import
// the i18n module, because they run in Node too. The UI translates a name or a message with t()
// where it shows it, so that the English text is the key.

export const MODEL: Record<string, string> = {
  // The systems of the utilities (src/model/services.ts, SERVICE_SYSTEMS)
  Water: "Wasser",
  Heating: "Heizung",
  Electricity: "Elektro",
  Communication: "Kommunikation",

  // The devices (FIXTURE_TYPES)
  "Water outlet": "Wasseranschluss",
  "Waste connection": "Abwasseranschluss",
  "Floor drain": "Bodenablauf",
  "Outdoor tap": "Außenwasserhahn",
  "Water meter": "Wasserzähler",
  "Hot water tank": "Warmwasserspeicher",
  Radiator: "Heizkörper",
  "Towel radiator": "Handtuchheizkörper",
  "Floor heating manifold": "Fußbodenheizungsverteiler",
  Boiler: "Kessel",
  "Heat pump": "Wärmepumpe",
  Socket: "Steckdose",
  "Double socket": "Doppelsteckdose",
  Switch: "Schalter",
  "Two-way switch": "Wechselschalter",
  "Ceiling light": "Deckenleuchte",
  "Wall light": "Wandleuchte",
  "Junction box": "Abzweigdose",
  "Smoke detector": "Rauchmelder",
  "Distribution board": "Verteiler",
  "PV inverter": "PV-Wechselrichter",
  "Battery storage": "Batteriespeicher",
  "Network socket": "Netzwerkdose",
  "Phone socket": "Telefondose",
  "TV socket": "TV-Dose",
  "SAT socket": "SAT-Dose",
  Router: "Router",
  "Network cabinet": "Netzwerkschrank",
  "SAT multiswitch": "SAT-Multischalter",

  // The lines (RUN_KINDS)
  "Cold water pipe": "Kaltwasserleitung",
  "Hot water pipe": "Warmwasserleitung",
  "Circulation pipe": "Zirkulationsleitung",
  "Waste water pipe": "Abwasserleitung",
  "Flow pipe": "Vorlaufleitung",
  "Return pipe": "Rücklaufleitung",
  "Power cable": "Stromkabel",
  "Light cable": "Lichtkabel",
  "PV cable": "PV-Kabel",
  "Network cable": "Netzwerkkabel",
  "Phone cable": "Telefonkabel",
  "TV cable": "TV-Kabel",
  "SAT cable": "SAT-Kabel",

  // The kinds of heating (src/model/heating.ts, HEATING_KINDS), and their final energy
  "Gas boiler": "Gaskessel",
  "Oil boiler": "Ölkessel",
  "Wood or pellets": "Holz oder Pellets",
  "District heating": "Fernwärme",
  "Direct electric": "Direktstrom",
  electricity: "Strom",
  gas: "Gas",
  oil: "Heizöl",
  wood: "Holz",
  heat: "Fernwärme",

  // The materials of the layers (src/model/insulation.ts, MATERIALS)
  Brick: "Ziegel",
  "Insulating brick": "Wärmedämmziegel",
  "Aerated concrete": "Porenbeton",
  "Sand-lime brick": "Kalksandstein",
  "Reinforced concrete": "Stahlbeton",
  Timber: "Holz",
  Plaster: "Putz",
  Screed: "Estrich",
  Plasterboard: "Gipskarton",
  EPS: "EPS",
  XPS: "XPS",
  "Mineral wool": "Mineralwolle",
  "Wood fiber": "Holzfaser",
  "PUR/PIR": "PUR/PIR",
  Cellulose: "Zellulose",

  // The measures of a renovation (src/model/variants.ts, MEASURES)
  "10 cm more insulation on the walls": "10 cm mehr Dämmung an den Wänden",
  "10 cm more insulation on the roof": "10 cm mehr Dämmung am Dach",
  "10 cm more insulation on the slab to unheated stories":
    "10 cm mehr Dämmung an der Decke zu unbeheizten Geschossen",
  "Triple glazing (U 0.7)": "Dreifachverglasung (U 0,7)",
  "PV on the best free roof face": "PV auf der besten freien Dachfläche",
  // The name comes from BATTERY_MEASURE = 10. A change of the constant needs a new key.
  "A battery of 10 kWh": "Batteriespeicher mit 10 kWh",
  "Heated cellar": "Beheizter Keller",
  "Unheated cellar": "Unbeheizter Keller",

  // The generic furniture (src/model/furniture.ts, GENERIC_TYPES)
  Sofa: "Sofa",
  Armchair: "Sessel",
  "Coffee table": "Couchtisch",
  Sideboard: "Sideboard",
  Shelf: "Regal",
  "Single bed": "Einzelbett",
  "Double bed": "Doppelbett",
  Nightstand: "Nachttisch",
  Wardrobe: "Kleiderschrank",
  Table: "Tisch",
  "Round table": "Runder Tisch",
  Chair: "Stuhl",
  "Kitchen counter": "Küchenzeile",
  "Kitchen sink": "Spüle",
  Stove: "Herd",
  Fridge: "Kühlschrank",
  "Wall cabinet": "Hängeschrank",
  Toilet: "WC",
  Washbasin: "Waschbecken",
  Bathtub: "Badewanne",
  Shower: "Dusche",
  "Washing machine": "Waschmaschine",
  Desk: "Schreibtisch",
  "Office chair": "Bürostuhl",
  Box: "Quader",
  Model: "Modell",

  // The groups of the furniture catalog (CATEGORY_NAMES), and the tabs of the catalog
  Living: "Wohnen",
  Dining: "Essen",
  Kitchen: "Küche",
  Sleeping: "Schlafen",
  Bath: "Bad",
  Work: "Arbeiten",
  Storage: "Stauraum",
  Lighting: "Beleuchtung",
  Decor: "Dekoration",
  Other: "Sonstiges",
  Generic: "Allgemein",
  Imported: "Importiert",

  // The names of new stories (src/model/building.ts)
  "Ground floor": "Erdgeschoss",
  "First floor": "1. Obergeschoss",
  "Second floor": "2. Obergeschoss",
  "Third floor": "3. Obergeschoss",
  "Fourth floor": "4. Obergeschoss",
  "Fifth floor": "5. Obergeschoss",
  "Sixth floor": "6. Obergeschoss",
  Cellar: "Keller",
  "Cellar 2": "Keller 2",
  "Cellar 3": "Keller 3",
  Attic: "Dachgeschoss",

  // The presets of a roof, and the kinds of its sides
  Gable: "Giebel",
  "Half hip": "Krüppelwalm",
  Hip: "Walmdach",
  Shed: "Pultdach",
  Flat: "Flachdach",
  Eave: "Traufe",

  // The parts of the envelope in the quantities (src/model/takeoff.ts)
  "Outer walls": "Außenwände",
  Roof: "Dach",
  "Floor on the ground": "Boden gegen Erdreich",
  "Slab to an unheated story": "Decke zu einem unbeheizten Geschoss",

  // The messages of src/model/file.ts
  "The file is not valid JSON.": "Die Datei ist kein gültiges JSON.",
  "The file is not a Grundriss plan.": "Die Datei ist kein Grundriss-Plan.",
  "The file is damaged: it has no story.": "Die Datei ist beschädigt: Sie hat kein Geschoss.",
  'The file is damaged: invalid "roof".': "Die Datei ist beschädigt: ungültiges „roof“.",
  'The file is damaged: invalid "location".': "Die Datei ist beschädigt: ungültiges „location“.",
  'The file is damaged: invalid "climate".': "Die Datei ist beschädigt: ungültiges „climate“.",
  'The file is damaged: the roof has no valid "kind".':
    "Die Datei ist beschädigt: Das Dach hat kein gültiges „kind“.",
  "The file is damaged: the roof refers to a story that does not exist.":
    "Die Datei ist beschädigt: Das Dach verweist auf ein Geschoss, das es nicht gibt.",
  'The file is damaged: invalid "background".':
    "Die Datei ist beschädigt: ungültiges „background“.",

  // The messages of src/io/
  "Grundriss package": "Grundriss-Paket",
  "Grundriss plan (JSON)": "Grundriss-Plan (JSON)",
  "Grundriss plan": "Grundriss-Plan",
  "The image has no size in pixels. Use a PNG or a JPEG file.":
    "Das Bild hat keine Größe in Pixeln. Verwenden Sie eine PNG- oder JPEG-Datei.",
  "An image or a model of the plan is not a valid data URL.":
    "Ein Bild oder ein Modell des Plans ist keine gültige Data-URL.",
  "The package is damaged: it is not a valid ZIP file.":
    "Das Paket ist beschädigt: Es ist keine gültige ZIP-Datei.",
  "The file is not a backup of Grundriss.": "Die Datei ist keine Sicherung von Grundriss.",
  "The file is not a backup of this version of Grundriss.":
    "Die Datei ist keine Sicherung dieser Version von Grundriss.",
  "This browser cannot store projects.": "Dieser Browser kann keine Projekte speichern.",
  "The browser blocks the storage.": "Der Browser blockiert den Speicher.",
  "Another tab of Grundriss blocks the storage.":
    "Ein anderer Tab von Grundriss blockiert den Speicher.",
  "The browser stopped the save.": "Der Browser hat das Speichern abgebrochen.",
  "The app cannot reach open-meteo.com. Check the network connection.":
    "Die App erreicht open-meteo.com nicht. Prüfen Sie die Netzwerkverbindung.",
  "Open-Meteo has too many requests from this network now. Try again in a minute, or tomorrow.":
    "Open-Meteo hat gerade zu viele Anfragen aus diesem Netzwerk. Versuchen Sie es in einer Minute oder morgen wieder.",
  "Open-Meteo sent an answer that the app cannot read. Try again later.":
    "Open-Meteo hat eine Antwort gesendet, die die App nicht lesen kann. Versuchen Sie es später wieder.",
  "Open-Meteo sent weather data that the app cannot read. Try again later.":
    "Open-Meteo hat Wetterdaten gesendet, die die App nicht lesen kann. Versuchen Sie es später wieder.",
  "The latitude must be from −90 to 90 and the longitude from −180 to 180.":
    "Die Breite muss zwischen −90 und 90 liegen und die Länge zwischen −180 und 180.",

  // The messages of src/furniture/
  "Choose a .glb or a .gltf file.": "Wählen Sie eine .glb- oder .gltf-Datei.",
  "The .gltf file is not valid JSON.": "Die .gltf-Datei ist kein gültiges JSON.",
  "This .gltf file uses separate files (.bin or textures). Export the model as one .glb file and import that.":
    "Diese .gltf-Datei verwendet separate Dateien (.bin oder Texturen). Exportieren Sie das Modell als eine .glb-Datei, und importieren Sie diese.",
  "The model has no geometry.": "Das Modell hat keine Geometrie.",
  "The model cannot be written as GLB.": "Das Modell lässt sich nicht als GLB schreiben.",
  "The app cannot reach Poly Haven. Check the network connection.":
    "Die App erreicht Poly Haven nicht. Prüfen Sie die Netzwerkverbindung.",
  "Poly Haven sent an answer that the app cannot read. Try again later.":
    "Poly Haven hat eine Antwort gesendet, die die App nicht lesen kann. Versuchen Sie es später wieder.",
  // The names of the rooms of the example house (src/model/example.ts), with the prefix "room ",
  // because a word like "Living" is also a group of the catalog.
  "room Kitchen": "Küche",
  "room Hall": "Flur",
  "room Living": "Wohnzimmer",
  "room Utility": "Technikraum",
  "room Bath": "Bad",
  "room Bedroom": "Schlafzimmer",
  "room Study": "Arbeitszimmer",
  "room Kids": "Kinderzimmer",
  "Main roof": "Hauptdach",
  "Household electricity": "Haushaltsstrom",
  "Outer walls with own layers": "Außenwände mit eigenen Schichten",
};
