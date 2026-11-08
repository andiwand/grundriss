// The texts of the website in each language. The page template (page.ts) and the live numbers of
// the cards (main.ts) take all their words from here. Some texts contain HTML, for example links.
// A text with {name} gets a value at that place (see `fill`).

export type Lang = "en" | "de";

/** The languages of the website. The first one is at the root, each other one in its folder. */
export const LANGS: Lang[] = ["en", "de"];

/** The key in localStorage that keeps the language that the visitor chose with the switch. */
export const LANG_KEY = "grundriss-site-lang";

/** The ids of the chapters of the scroll story, in their order. */
export type ChapterId =
  | "scan"
  | "plan"
  | "walls"
  | "stories"
  | "roof"
  | "furnish"
  | "services"
  | "heat"
  | "sun"
  | "renovate"
  | "visit"
  | "export";

export interface ChapterText {
  kicker: string;
  title: string;
  text: string;
  /** A short caveat under the text, or nothing. */
  note?: string;
}

const en = {
  meta: {
    title: "Grundriss – document your house and plan its renovation",
    description:
      "Grundriss turns a scanned floor plan into a 2D and 3D model of your house and helps you plan the renovation. Free and open source, in your browser.",
    ogDescription:
      "Model your house from an old floor plan and plan its renovation. Free and open source, in your browser.",
  },
  nav: {
    home: "Grundriss home",
    open: "Open the app",
    language: "Language",
    chapters: "Chapters",
  },
  hero: {
    logo: "Grundriss logo",
    tagline: "Get to know your house before you renovate it.",
    lead: "Trace the old floor plan and you get a model of your house in 2D and 3D. Then check what new insulation or a heat pump would change, what it costs, and when it pays back.",
    open: "Open the app",
    source: "Source on GitHub",
    pills: ["Free", "Open source", "No account", "Works offline", "Plans stay on your device"],
    scroll: "Scroll to build the house",
  },
  uses: {
    kicker: "Who it is for",
    title: "What you can do with it",
    lead: "Grundriss is made for homeowners. It is useful for people who work on houses, too.",
    items: [
      {
        chapter: "scan",
        title: "Document an old house",
        text: "The old paper plan from the drawer becomes an accurate model: rooms with their areas, the stories, the roof, and where pipes and cables run. Notes and photos stay with each wall, window, and room.",
      },
      {
        chapter: "renovate",
        title: "Plan a renovation",
        text: "Put together a few variants, for example new windows or a heat pump. A table shows the estimated cost, subsidy, energy cost, and payback time of each.",
      },
      {
        chapter: "heat",
        title: "Will a heat pump work?",
        text: "See the heat loss of each room and the flow temperature your radiators need. Then you know which rooms hold a heat pump back.",
      },
      {
        chapter: "visit",
        title: "Check a house before you buy",
        text: "Bring a tablet to the viewing. Sketch the rooms, add notes and photos, and estimate the heating cost later at home.",
      },
      {
        chapter: "export",
        title: "Get quotes",
        text: "Send the installer a plan at scale, a PDF report, and the quantities as CSV: wall and roof areas, pipe and cable lengths, devices, and circuits.",
      },
      {
        chapter: "plan",
        title: "For professionals",
        text: "Architects, energy advisors, and installers can do a quick as-built survey and a first estimate on site. It runs in the browser, with no license to buy.",
      },
    ] as { chapter: ChapterId; title: string; text: string }[],
  },
  chapters: {
    scan: {
      kicker: "Trace",
      title: "Start with the old plan",
      text: "Load a scan or a photo of the plan. OpenCV straightens and cleans the image, and a neural network in your browser suggests walls, doors, and windows. You keep or drop each suggestion. Enter one length you know, and the plan is to scale.",
    },
    plan: {
      kicker: "Draw",
      title: "Walls, doors, and rooms",
      text: "Draw walls with snapping and angles, then add doors, windows, and dimensions. Each door and window shows which way it opens. Rooms close by themselves and get a name and an area. If a cupboard stands in the way of a door, the app marks it.",
    },
    walls: {
      kicker: "3D",
      title: "The house in 3D",
      text: "The 3D view next to the plan shows each wall with its thickness, its height, and the openings for doors and windows. Turn the house while you draw, or drag furniture, doors, and windows in 3D.",
    },
    stories: {
      kicker: "Stories",
      title: "Cellar to attic",
      text: "Add a cellar, more floors, and an attic, and connect them with straight, L, or U stairs. You can mark a cellar or an attic as unheated.",
    },
    roof: {
      kicker: "Roof",
      title: "Any roof shape",
      text: "Gable, hip, half hip, shed, or flat on any outline, or set each side on its own. Add dormers and roof windows. Each attic room shows its living area by the German WoFlV.",
    },
    furnish: {
      kicker: "Furniture",
      title: "Will the sofa fit?",
      text: "Place simple pieces in any size, models from the Kenney Furniture Kit and Poly Haven, or your own glTF files. A piece near a wall turns its back to it.",
    },
    services: {
      kicker: "Utilities",
      title: "Pipes and cables",
      text: "Place devices for water, heating, electricity, and communication, and connect them with pipes and cables. Grundriss counts the devices and measures the lengths. Circuits go into a distribution board.",
    },
    heat: {
      kicker: "Heat",
      title: "Where the heat goes",
      text: "Enter the layers of the walls, roof, and floor to get the U-values and the heat loss of each room. With the climate of your location, Grundriss also estimates the heating demand per year and checks for overheating in summer. The colors show the flow temperature the radiators need. Up to 45 °C suits a heat pump well.",
      note: "Estimates for planning, not an energy certificate.",
    },
    sun: {
      kicker: "Solar",
      title: "Solar panels and battery",
      text: "Panels go on roof faces, or on racks on a flat roof. Grundriss accounts for the shade of chimneys, dormers, and other roofs. An hourly balance over one year shows what the house uses itself, what goes into the battery, and what goes to the grid.",
    },
    renovate: {
      kicker: "Renovation",
      title: "Compare before you spend",
      text: "Build variants from measures such as insulation, triple glazing, a heat pump, PV, or a battery, or try a floor plan without that one wall. Each variant gets a cost estimate with Austrian or German prices, a subsidy estimate for Germany (BEG), the energy cost per year, and the payback time with interest and rising prices. Once the installer sends a quote, put in the real price. A table compares all variants.",
      note: "Rough estimates. A real quote and an energy advisor have the final say.",
    },
    visit: {
      kicker: "On site",
      title: "At the viewing",
      text: "Install Grundriss on a phone or tablet, and it works offline. Pin notes and photos to a wall, a window, or a room. Each project saves after every change, and you can back up all projects as a ZIP file.",
    },
    export: {
      kicker: "Export",
      title: "Print and export",
      text: "Print the plan to PDF at 1:50 or 1:100, or export SVG, DXF for CAD, or glTF for Blender. A PDF report covers the rooms, the energy, and the renovation, and the quantities export as CSV. A .grundriss package holds everything.",
    },
  } as Record<ChapterId, ChapterText>,
  finale: {
    title: "Try it with your own house.",
    lead: "Grundriss runs in your browser, with no install, no account, and no server. Your plans stay on your device.",
    open: "Open Grundriss",
    facts: [
      {
        title: "In the browser",
        text: "Built with TypeScript, Three.js, OpenCV, and ONNX Runtime. Installed as an app, it works offline.",
      },
      {
        title: "Private",
        text: "Your plans never go to a server. The app sends your location only when you load the climate or the map.",
      },
      {
        title: "Open source",
        text: "MPL-2.0. Read the code, report a bug, or send a pull request.",
      },
      {
        title: "Numbers on this page",
        text: "The app computes every number on this page for an example house. Energy and cost values are estimates, not an energy certificate.",
      },
    ],
    credits:
      'Furniture models: <a href="https://kenney.nl">Kenney</a> (CC0) and <a href="https://polyhaven.com">Poly Haven</a> (CC0). Built with <a href="https://threejs.org">Three.js</a>, <a href="https://opencv.org">OpenCV</a>, and <a href="https://onnxruntime.ai">ONNX Runtime</a>.',
  },
  readout: {
    wallsFound: "Walls found",
    doors: "Doors",
    windows: "Windows",
    groundFloor: "Ground floor",
    walls: "Walls",
    openings: "Openings",
    height: "Height",
    stair: "Stair",
    stairValue: "{kind} · {n} steps",
    stairKinds: { straight: "Straight", l: "L-shaped", u: "U-shaped" },
    pitch: "Pitch",
    ridge: "Ridge",
    dormerWindows: "Dormer · roof windows",
    attic: "Attic living area",
    atticValue: "{living} of {floor}",
    pieces: "Pieces",
    sources: "Sources",
    sourcesValue: "Generic · Kenney · Poly Haven · glTF",
    socketsSwitches: "Sockets · switches",
    cable: "Cable",
    heatingPipe: "Heating pipe",
    radiators: "Radiators",
    heatLoss: "Heat loss",
    flow: "Flow temperature needed",
    readyRooms: "Rooms ready at 55 °C",
    readyValue: "{n} of {total}",
    panels: "Solar panels",
    peak: "Peak power",
    yield: "Yield",
    perYear: "{n} kWh / year",
    costAT: "Cost estimate · Austria",
    costDE: "Cost estimate · Germany",
    subsidy: "Subsidy estimate · BEG",
    offline: "Internet on site",
    offlineValue: "not needed",
    account: "Account",
    accountValue: "none",
    saves: "Saves",
    savesValue: "after each change",
    backup: "Backup",
    backupValue: "ZIP of all projects",
    formats: "Formats",
    formatsValue: "PDF · SVG · DXF · glTF · CSV",
    report: "Report",
    reportValue: "PDF with rooms, energy, renovation",
  },
  /** The chips of the export picture: a format and a short note. */
  chips: [
    ["PDF", "1:50 · 1:100"],
    ["Report", "PDF"],
    ["Quantities", "CSV"],
    ["SVG", "vector"],
    ["DXF", "CAD"],
    ["glTF", "3D"],
    [".grundriss", "everything"],
  ] as [string, string][],
  legend: {
    title: "Flow temperature for each room",
    good: "up to 45 °C",
    fair: "up to 55 °C",
    poor: "more",
    none: "no radiator",
  },
  compare: {
    title: "Heat loss of each variant",
    plan: "As it is",
    walls: "+ 10 cm on the walls",
    roof: "+ 10 cm on the roof",
    windows: "Triple glazing",
    all: "All three",
  },
  /** The notes of the tablet picture: the room of the example house, and the text. */
  pins: [
    ["Bath", "Water heater from 1994, see photo"],
    ["Living", "Single glazing, draughty"],
    ["Bedroom", "Damp corner behind the wardrobe"],
  ] as [string, string][],
  /** The names of the example house. A missing name stays as it is. */
  names: {} as Record<string, string>,
};

export type Texts = typeof en;

const de: Texts = {
  meta: {
    title: "Grundriss – Ihr Haus erfassen und die Sanierung planen",
    description:
      "Grundriss macht aus einem gescannten Grundriss ein 2D- und 3D-Modell Ihres Hauses und hilft bei der Planung der Sanierung. Kostenlos, Open Source und im Browser.",
    ogDescription:
      "Erfassen Sie Ihr Haus anhand eines alten Plans und planen Sie die Sanierung. Kostenlos und Open Source, im Browser.",
  },
  nav: {
    home: "Grundriss Startseite",
    open: "App öffnen",
    language: "Sprache",
    chapters: "Kapitel",
  },
  hero: {
    logo: "Grundriss Logo",
    tagline: "Lernen Sie Ihr Haus kennen, bevor Sie es sanieren.",
    lead: "Zeichnen Sie den alten Grundriss nach, und Sie haben ein Modell Ihres Hauses in 2D und 3D. Dann sehen Sie, was neue Dämmung oder eine Wärmepumpe ändert, was sie kostet und wann sie sich rechnet.",
    open: "App öffnen",
    source: "Quellcode auf GitHub",
    pills: [
      "Kostenlos",
      "Open Source",
      "Ohne Konto",
      "Funktioniert offline",
      "Pläne bleiben auf Ihrem Gerät",
    ],
    scroll: "Scrollen Sie, und das Haus entsteht",
  },
  uses: {
    kicker: "Für wen",
    title: "Was Sie damit machen können",
    lead: "Grundriss ist für Hausbesitzerinnen und Hausbesitzer gemacht. Auch für Fachleute, die an Häusern arbeiten, ist es nützlich.",
    items: [
      {
        chapter: "scan",
        title: "Ein altes Haus dokumentieren",
        text: "Aus dem alten Papierplan in der Schublade wird ein genaues Modell: Räume mit Flächen, Geschosse, das Dach und der Verlauf von Rohren und Kabeln. Notizen und Fotos hängen direkt an Wand, Fenster und Raum.",
      },
      {
        chapter: "renovate",
        title: "Eine Sanierung planen",
        text: "Stellen Sie ein paar Varianten zusammen, etwa neue Fenster oder eine Wärmepumpe. Eine Tabelle zeigt für jede die geschätzten Kosten, die Förderung, die Energiekosten und die Amortisationszeit.",
      },
      {
        chapter: "heat",
        title: "Passt eine Wärmepumpe?",
        text: "Sie sehen die Heizlast jedes Raums und die Vorlauftemperatur, die Ihre Heizkörper brauchen. So wissen Sie, welche Räume eine Wärmepumpe ausbremsen.",
      },
      {
        chapter: "visit",
        title: "Ein Haus vor dem Kauf prüfen",
        text: "Nehmen Sie ein Tablet zur Besichtigung mit. Skizzieren Sie die Räume, halten Sie Notizen und Fotos fest, und schätzen Sie die Heizkosten später zu Hause ab.",
      },
      {
        chapter: "export",
        title: "Angebote einholen",
        text: "Schicken Sie dem Handwerksbetrieb einen Plan im Maßstab, einen PDF-Bericht und die Mengen als CSV: Wand- und Dachflächen, Rohr- und Kabellängen, Geräte und Stromkreise.",
      },
      {
        chapter: "plan",
        title: "Für Fachleute",
        text: "Architekturbüros, Energieberater und Installateure nehmen vor Ort schnell den Bestand auf und machen eine erste Abschätzung. Es läuft im Browser, ohne Lizenzkosten.",
      },
    ],
  },
  chapters: {
    scan: {
      kicker: "Nachzeichnen",
      title: "Mit dem alten Plan beginnen",
      text: "Laden Sie einen Scan oder ein Foto des Plans. OpenCV richtet das Bild gerade und säubert es, und ein neuronales Netz in Ihrem Browser schlägt Wände, Türen und Fenster vor. Sie übernehmen oder verwerfen jeden Vorschlag. Geben Sie eine bekannte Länge ein, dann stimmt der Maßstab.",
    },
    plan: {
      kicker: "Zeichnen",
      title: "Wände, Türen und Räume",
      text: "Zeichnen Sie Wände mit Fang und Winkeln, dann Türen, Fenster und Bemaßungen. Jede Tür und jedes Fenster zeigt, wohin es aufgeht. Räume schließen sich von selbst und bekommen Namen und Fläche. Steht ein Schrank vor einer Tür, markiert die App das.",
    },
    walls: {
      kicker: "3D",
      title: "Das Haus in 3D",
      text: "Die 3D-Ansicht neben dem Plan zeigt jede Wand mit Stärke, Höhe und den Öffnungen für Türen und Fenster. Drehen Sie das Haus, während Sie zeichnen, oder verschieben Sie Möbel, Türen und Fenster direkt in 3D.",
    },
    stories: {
      kicker: "Geschosse",
      title: "Vom Keller bis zum Dach",
      text: "Fügen Sie Keller, weitere Geschosse und ein Dachgeschoss hinzu, und verbinden Sie sie mit geraden, L- oder U-Treppen. Keller und Dachboden lassen sich als unbeheizt markieren.",
    },
    roof: {
      kicker: "Dach",
      title: "Jede Dachform",
      text: "Sattel-, Walm-, Krüppelwalm-, Pult- oder Flachdach auf jedem Umriss, oder jede Seite für sich. Dazu Dachgauben und Dachfenster. Jeder Raum im Dachgeschoss zeigt seine Wohnfläche nach WoFlV.",
    },
    furnish: {
      kicker: "Möbel",
      title: "Passt das Sofa?",
      text: "Stellen Sie einfache Möbel in jeder Größe auf, Modelle aus dem Kenney Furniture Kit und von Poly Haven oder eigene glTF-Dateien. An einer Wand dreht sich ein Möbelstück mit dem Rücken zu ihr.",
    },
    services: {
      kicker: "Haustechnik",
      title: "Rohre und Kabel",
      text: "Setzen Sie Geräte für Wasser, Heizung, Strom und Kommunikation, und verbinden Sie sie mit Rohren und Kabeln. Grundriss zählt die Geräte und misst die Längen. Die Stromkreise ordnen Sie im Verteiler zu.",
    },
    heat: {
      kicker: "Wärme",
      title: "Wo die Wärme hingeht",
      text: "Geben Sie den Aufbau von Wänden, Dach und Boden ein, und Sie erhalten die U-Werte und die Heizlast jedes Raums. Mit dem Klima Ihres Standorts schätzt Grundriss auch den Heizwärmebedarf pro Jahr und prüft, ob es im Sommer zu warm wird. Die Farben zeigen die Vorlauftemperatur, die die Heizkörper brauchen. Bis 45 °C passt gut zu einer Wärmepumpe.",
      note: "Schätzwerte für die Planung, kein Energieausweis.",
    },
    sun: {
      kicker: "Sonne",
      title: "Photovoltaik",
      text: "Belegen Sie Dachflächen mit Modulen, oder stellen Sie sie auf dem Flachdach auf Gestelle. Grundriss berücksichtigt den Schatten von Schornsteinen, Gauben und anderen Dächern und rechnet jede Stunde eines Jahres durch: Eigenverbrauch, Speicher und Netz.",
    },
    renovate: {
      kicker: "Sanierung",
      title: "Erst vergleichen, dann investieren",
      text: "Stellen Sie Varianten aus Maßnahmen zusammen, etwa Dämmung, Dreifachverglasung, Wärmepumpe, Photovoltaik oder Speicher, oder probieren Sie einen Grundriss ohne die eine Wand. Jede Variante bekommt eine Kostenschätzung mit Preisen aus Österreich oder Deutschland, eine Förderschätzung für Deutschland (BEG), die Energiekosten pro Jahr und die Amortisationszeit mit Zinsen und Preissteigerung. Liegt das Angebot vom Installateur vor, tragen Sie den echten Preis ein. Eine Tabelle vergleicht alle Varianten.",
      note: "Grobe Schätzungen. Das letzte Wort haben ein echtes Angebot und die Energieberatung.",
    },
    visit: {
      kicker: "Vor Ort",
      title: "Bei der Besichtigung",
      text: "Installieren Sie Grundriss auf Handy oder Tablet, dann funktioniert es auch offline. Heften Sie Notizen und Fotos an eine Wand, ein Fenster oder einen Raum. Jedes Projekt speichert sich nach jeder Änderung, und alle Projekte lassen sich als ZIP-Datei sichern.",
    },
    export: {
      kicker: "Export",
      title: "Drucken und exportieren",
      text: "Drucken Sie den Plan als PDF im Maßstab 1:50 oder 1:100, oder exportieren Sie SVG, DXF für CAD oder glTF für Blender. Ein PDF-Bericht fasst Räume, Energie und Sanierung zusammen, die Mengen gibt es als CSV. Ein .grundriss-Paket enthält alles.",
    },
  },
  finale: {
    title: "Probieren Sie es mit Ihrem Haus aus.",
    lead: "Grundriss läuft im Browser, ohne Installation, ohne Konto und ohne Server. Ihre Pläne bleiben auf Ihrem Gerät.",
    open: "Grundriss öffnen",
    facts: [
      {
        title: "Im Browser",
        text: "Gebaut mit TypeScript, Three.js, OpenCV und ONNX Runtime. Als App installiert, funktioniert es offline.",
      },
      {
        title: "Privat",
        text: "Ihre Pläne gehen an keinen Server. Ihren Standort sendet die App nur, wenn Sie das Klima oder die Karte laden.",
      },
      {
        title: "Open Source",
        text: "MPL-2.0. Lesen Sie den Code, melden Sie einen Fehler, oder schicken Sie einen Pull Request.",
      },
      {
        title: "Zahlen auf dieser Seite",
        text: "Jede Zahl auf dieser Seite berechnet die App für ein Beispielhaus. Energie- und Kostenwerte sind Schätzungen, kein Energieausweis.",
      },
    ],
    credits:
      'Möbelmodelle: <a href="https://kenney.nl">Kenney</a> (CC0) und <a href="https://polyhaven.com">Poly Haven</a> (CC0). Gebaut mit <a href="https://threejs.org">Three.js</a>, <a href="https://opencv.org">OpenCV</a> und <a href="https://onnxruntime.ai">ONNX Runtime</a>.',
  },
  readout: {
    wallsFound: "Gefundene Wände",
    doors: "Türen",
    windows: "Fenster",
    groundFloor: "Erdgeschoss",
    walls: "Wände",
    openings: "Öffnungen",
    height: "Höhe",
    stair: "Treppe",
    stairValue: "{kind} · {n} Stufen",
    stairKinds: { straight: "Gerade", l: "L-Form", u: "U-Form" },
    pitch: "Neigung",
    ridge: "First",
    dormerWindows: "Gaube · Dachfenster",
    attic: "Wohnfläche im Dach",
    atticValue: "{living} von {floor}",
    pieces: "Möbelstücke",
    sources: "Quellen",
    sourcesValue: "Einfach · Kenney · Poly Haven · glTF",
    socketsSwitches: "Steckdosen · Schalter",
    cable: "Kabel",
    heatingPipe: "Heizungsrohr",
    radiators: "Heizkörper",
    heatLoss: "Heizlast",
    flow: "Nötige Vorlauftemperatur",
    readyRooms: "Räume bereit bei 55 °C",
    readyValue: "{n} von {total}",
    panels: "Module",
    peak: "Spitzenleistung",
    yield: "Ertrag",
    perYear: "{n} kWh / Jahr",
    costAT: "Kostenschätzung · Österreich",
    costDE: "Kostenschätzung · Deutschland",
    subsidy: "Förderschätzung · BEG",
    offline: "Internet vor Ort",
    offlineValue: "nicht nötig",
    account: "Konto",
    accountValue: "keines",
    saves: "Speichert",
    savesValue: "nach jeder Änderung",
    backup: "Sicherung",
    backupValue: "ZIP aller Projekte",
    formats: "Formate",
    formatsValue: "PDF · SVG · DXF · glTF · CSV",
    report: "Bericht",
    reportValue: "PDF mit Räumen, Energie, Sanierung",
  },
  chips: [
    ["PDF", "1:50 · 1:100"],
    ["Bericht", "PDF"],
    ["Mengen", "CSV"],
    ["SVG", "Vektor"],
    ["DXF", "CAD"],
    ["glTF", "3D"],
    [".grundriss", "alles"],
  ],
  legend: {
    title: "Vorlauftemperatur je Raum",
    good: "bis 45 °C",
    fair: "bis 55 °C",
    poor: "mehr",
    none: "kein Heizkörper",
  },
  compare: {
    title: "Heizlast je Variante",
    plan: "Bestand",
    walls: "+ 10 cm an den Wänden",
    roof: "+ 10 cm am Dach",
    windows: "Dreifachverglasung",
    all: "Alle drei",
  },
  pins: [
    ["Bath", "Boiler von 1994, siehe Foto"],
    ["Living", "Einfachverglasung, zieht"],
    ["Bedroom", "Feuchte Ecke hinter dem Schrank"],
  ],
  names: {
    "Ground floor": "Erdgeschoss",
    Attic: "Dachgeschoss",
    Kitchen: "Küche",
    Hall: "Flur",
    Living: "Wohnen",
    Utility: "Technik",
    Bath: "Bad",
    Bedroom: "Schlafen",
    Study: "Arbeiten",
    Kids: "Kinder",
  },
};

export const TEXTS: Record<Lang, Texts> = { en, de };

/** Puts the values into the places {name} of the text. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in values ? String(values[name]) : all,
  );
}

/** The path of the page of a language, relative to the root of the website. */
export const langPath = (lang: Lang): string => (lang === LANGS[0] ? "" : `${lang}/`);
