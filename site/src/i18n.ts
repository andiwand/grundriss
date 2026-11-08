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
      "Grundriss turns a scanned floor plan into a model of your house in 2D and 3D, and helps you plan the renovation: heat loss, heat pump, solar, battery, cost, subsidy, and payback. Free, open source, and it runs in your browser.",
    ogDescription:
      "From a sketch to a house you can walk around – and a renovation you can plan. Free and open source, in your browser.",
  },
  nav: {
    home: "Grundriss home",
    open: "Open the app",
    language: "Language",
    chapters: "Chapters",
  },
  hero: {
    logo: "Grundriss logo",
    tagline: "From a sketch to a house you can walk around.",
    lead: "Turn an old floor plan into a model of your house in 2D and 3D. Then plan what comes next – insulation, a heat pump, solar panels, a battery – and see what it costs, what the subsidy covers, and when it pays back.",
    open: "Open the app",
    source: "Source on GitHub",
    pills: ["Free", "Open source", "No account", "Works offline", "Your data stays with you"],
    scroll: "Scroll to build the house",
  },
  uses: {
    kicker: "Who it is for",
    title: "One model of your house. Many answers.",
    lead: "Grundriss is made for homeowners first – and it is useful for the people who work on houses, too.",
    items: [
      {
        chapter: "scan",
        title: "Document an older house",
        text: "Turn the old paper plans into an accurate model: rooms and areas, stories, the roof, and where the pipes and cables run. Notes and photos stay with each wall, window, and room.",
      },
      {
        chapter: "renovate",
        title: "Plan a renovation",
        text: "Compare variants – more insulation, new windows, a heat pump, PV, a battery – with a cost estimate, the subsidy, the energy cost, and the payback time.",
      },
      {
        chapter: "heat",
        title: "Ready for a heat pump?",
        text: "See the heat loss of every room and the flow temperature that your radiators need. Find the rooms that hold a heat pump back.",
      },
      {
        chapter: "visit",
        title: "Check a house before you buy",
        text: "Take a tablet to the viewing: sketch the rooms, pin notes and photos to what you see, and estimate the heating cost later at home.",
      },
      {
        chapter: "export",
        title: "Brief your contractors",
        text: "Hand over a plan at scale, a PDF report, and the quantities as CSV: wall and roof areas, pipe and cable lengths, devices, and circuits.",
      },
      {
        chapter: "plan",
        title: "Quick surveys for professionals",
        text: "For architects, energy advisors, and installers: a fast as-built survey and a first estimate on site – in the browser, with no license and no install.",
      },
    ] as { chapter: ChapterId; title: string; text: string }[],
  },
  chapters: {
    scan: {
      kicker: "Trace",
      title: "Start with the paper you have",
      text: "Load a scan or a photo of an old plan. OpenCV straightens and cleans the image, and a neural network suggests the walls, doors, and windows – right in your browser. You accept or reject each one. Calibrate one known length, and the plan is to scale.",
    },
    plan: {
      kicker: "Draw",
      title: "Walls that know their rooms",
      text: "Draw walls with snapping and angles, and add doors, windows, and dimensions. Move a wall, and its neighbors follow. Rooms close by themselves, with their names and areas.",
    },
    walls: {
      kicker: "3D",
      title: "See it rise",
      text: "Each line you draw is a wall in the 3D view next to it, with its thickness, its height, and holes for every door and window. Orbit around it while you edit.",
    },
    stories: {
      kicker: "Stories",
      title: "From the cellar to the attic",
      text: "Add a cellar, more floors, or an attic. Straight, L, and U stairs climb to the next story, and chimneys go up through all of them. A cold cellar or attic stays unheated.",
    },
    roof: {
      kicker: "Roof",
      title: "Any roof, on any outline",
      text: "Gable, hip, half hip, shed, or flat – or set each side on its own. Add dormers and roof windows. The attic walls stop at the slope, and each room shows its living area by the German WoFlV.",
    },
    furnish: {
      kicker: "Furniture",
      title: "Make it a home",
      text: "Pick simple pieces in any size, the Kenney Furniture Kit, realistic models from Poly Haven, or your own glTF files. A piece near a wall turns its back to it. Check that the sofa fits before it arrives.",
    },
    services: {
      kicker: "Utilities",
      title: "Every pipe, every cable",
      text: "Water, heating, electricity, and communication, each a system of its own. Place the devices, connect them with pipes and cables, and give the circuits their place in the distribution board. Grundriss counts every device and measures every line.",
    },
    heat: {
      kicker: "Heat",
      title: "Where the heat goes",
      text: "Give the walls, the roof, and the floor their layers, and get the U-values, the thermal bridges, and the heat loss of each room – with ventilation and heat recovery. Load the climate of your location for the heating demand per year, hot water included, and a check for summer overheating. The colors show the flow temperature that the radiators of each room need: up to 45 °C suits a heat pump well.",
      note: "Estimates for planning – not an energy certificate.",
    },
    sun: {
      kicker: "Solar",
      title: "Catch the sun",
      text: "Fill roof faces with panels, or set them on racks on a flat roof. Grundriss takes off the shade of chimneys, dormers, and other roofs. With the climate of your location, it balances every hour of the year: what the house uses itself, what the battery stores, and what goes to the grid.",
    },
    renovate: {
      kicker: "Renovation",
      title: "Compare before you spend",
      text: "Build variants from measures – insulation, triple glazing, a heat pump, PV, a battery – and compare them with the house as it is. Each variant gets a cost estimate with Austrian or German prices, a subsidy estimate for Germany (BEG), the energy cost per year, and the payback time with interest and rising prices.",
      note: "Rough estimates. A real offer and an energy advisor have the last word.",
    },
    visit: {
      kicker: "On site",
      title: "Take it to the viewing",
      text: "Install Grundriss as an app on a phone, a tablet, or a laptop, and it works offline. Pin notes and photos to a wall, a window, or a room – the damp corner, the old boiler, the meter. Each project saves itself in the browser after every change, with a trash and a backup as a ZIP file. On a phone, the panel is a sheet at the bottom, and two fingers zoom the plan.",
    },
    export: {
      kicker: "Export",
      title: "Take it anywhere",
      text: "Print the plan to PDF at a standard scale such as 1:50 or 1:100, open it in CAD as DXF, or take the house to Blender as glTF. A PDF report sums up the rooms, the energy, and the renovation for an energy advisor or a bank, and the quantities go to a spreadsheet as CSV. One .grundriss package keeps everything.",
    },
  } as Record<ChapterId, ChapterText>,
  finale: {
    title: "Start with your house tonight.",
    lead: "Grundriss runs in your browser. There is nothing to install, no account, and no server: your plans stay on your device.",
    open: "Open Grundriss",
    facts: [
      {
        title: "In the browser",
        text: "TypeScript, Three.js, OpenCV, and ONNX Runtime – no server. Installed as an app, it works offline.",
      },
      {
        title: "Private",
        text: "Your plan never goes to a server. The app sends your location only when you load the climate or the map.",
      },
      {
        title: "Open source",
        text: "MPL-2.0. Read the code, file an issue, or send a pull request.",
      },
      {
        title: "Honest numbers",
        text: "Every number on this page comes from the engine of the app. Energy and cost values are estimates for planning, not an energy certificate.",
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
    ["Bath", "Water heater from 1994 – see photo"],
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
      "Grundriss macht aus einem gescannten Grundriss ein Modell Ihres Hauses in 2D und 3D und hilft bei der Sanierung: Heizlast, Wärmepumpe, Photovoltaik, Speicher, Kosten, Förderung und Amortisation. Kostenlos, Open Source und direkt im Browser.",
    ogDescription:
      "Vom Plan auf Papier zum Haus, durch das Sie gehen können – und zur Sanierung, die Sie planen können. Kostenlos und Open Source, im Browser.",
  },
  nav: {
    home: "Grundriss Startseite",
    open: "App öffnen",
    language: "Sprache",
    chapters: "Kapitel",
  },
  hero: {
    logo: "Grundriss Logo",
    tagline: "Vom Plan auf Papier zum Haus, durch das Sie gehen können.",
    lead: "Machen Sie aus einem alten Plan ein Modell Ihres Hauses in 2D und 3D. Dann planen Sie den nächsten Schritt – Dämmung, Wärmepumpe, Photovoltaik, Stromspeicher – und sehen, was er kostet, was die Förderung übernimmt und wann er sich rechnet.",
    open: "App öffnen",
    source: "Quellcode auf GitHub",
    pills: [
      "Kostenlos",
      "Open Source",
      "Ohne Konto",
      "Funktioniert offline",
      "Ihre Daten bleiben bei Ihnen",
    ],
    scroll: "Scrollen Sie, und das Haus entsteht",
  },
  uses: {
    kicker: "Für wen",
    title: "Ein Modell Ihres Hauses. Viele Antworten.",
    lead: "Grundriss ist zuerst für Hausbesitzerinnen und Hausbesitzer gemacht – und nützlich für alle, die an Häusern arbeiten.",
    items: [
      {
        chapter: "scan",
        title: "Ein älteres Haus dokumentieren",
        text: "Aus den alten Papierplänen wird ein genaues Modell: Räume und Flächen, Geschosse, das Dach und der Verlauf von Rohren und Kabeln. Notizen und Fotos bleiben bei jeder Wand, jedem Fenster und jedem Raum.",
      },
      {
        chapter: "renovate",
        title: "Eine Sanierung planen",
        text: "Vergleichen Sie Varianten – mehr Dämmung, neue Fenster, Wärmepumpe, Photovoltaik, Speicher – mit Kostenschätzung, Förderung, Energiekosten und Amortisationszeit.",
      },
      {
        chapter: "heat",
        title: "Bereit für die Wärmepumpe?",
        text: "Sehen Sie die Heizlast jedes Raums und die Vorlauftemperatur, die Ihre Heizkörper brauchen. So finden Sie die Räume, die eine Wärmepumpe ausbremsen.",
      },
      {
        chapter: "visit",
        title: "Ein Haus vor dem Kauf prüfen",
        text: "Nehmen Sie ein Tablet zur Besichtigung mit: Räume skizzieren, Notizen und Fotos an das heften, was Ihnen auffällt – und zu Hause die Heizkosten abschätzen.",
      },
      {
        chapter: "export",
        title: "Zahlen für Handwerksbetriebe",
        text: "Geben Sie einen Plan im Maßstab, einen PDF-Bericht und die Mengen als CSV weiter: Wand- und Dachflächen, Rohr- und Kabellängen, Geräte und Stromkreise.",
      },
      {
        chapter: "plan",
        title: "Schnelle Aufnahme für Fachleute",
        text: "Für Architektur, Energieberatung und Haustechnik: eine schnelle Bestandsaufnahme und eine erste Abschätzung vor Ort – im Browser, ohne Lizenz und ohne Installation.",
      },
    ],
  },
  chapters: {
    scan: {
      kicker: "Nachzeichnen",
      title: "Beginnen Sie mit dem Papier, das Sie haben",
      text: "Laden Sie einen Scan oder ein Foto eines alten Plans. OpenCV richtet das Bild gerade und säubert es, und ein neuronales Netz schlägt Wände, Türen und Fenster vor – direkt im Browser. Sie übernehmen oder verwerfen jeden Vorschlag. Eine bekannte Länge genügt, und der Plan hat den richtigen Maßstab.",
    },
    plan: {
      kicker: "Zeichnen",
      title: "Wände, die ihre Räume kennen",
      text: "Zeichnen Sie Wände mit Fang und Winkeln, und setzen Sie Türen, Fenster und Bemaßungen. Verschieben Sie eine Wand, und die Nachbarwände folgen. Räume schließen sich von selbst, mit Namen und Fläche.",
    },
    walls: {
      kicker: "3D",
      title: "Sehen Sie es wachsen",
      text: "Jede Linie, die Sie zeichnen, steht daneben als Wand in 3D – mit ihrer Stärke, ihrer Höhe und einer Öffnung für jede Tür und jedes Fenster. Drehen Sie das Haus, während Sie zeichnen.",
    },
    stories: {
      kicker: "Geschosse",
      title: "Vom Keller bis unters Dach",
      text: "Fügen Sie einen Keller, weitere Geschosse oder ein Dachgeschoss hinzu. Gerade, L- und U-Treppen führen ins nächste Geschoss, und Schornsteine gehen durch alle hindurch. Ein kalter Keller oder Dachboden bleibt unbeheizt.",
    },
    roof: {
      kicker: "Dach",
      title: "Jedes Dach auf jedem Umriss",
      text: "Sattel-, Walm-, Krüppelwalm-, Pult- oder Flachdach – oder jede Seite für sich. Dazu Gauben und Dachfenster. Die Wände im Dachgeschoss enden an der Schräge, und jeder Raum zeigt seine Wohnfläche nach WoFlV.",
    },
    furnish: {
      kicker: "Möbel",
      title: "Machen Sie ein Zuhause daraus",
      text: "Wählen Sie einfache Möbel in jeder Größe, das Kenney Furniture Kit, realistische Modelle von Poly Haven oder eigene glTF-Dateien. An einer Wand dreht sich ein Möbelstück mit dem Rücken zu ihr. So wissen Sie, ob das Sofa passt, bevor es geliefert wird.",
    },
    services: {
      kicker: "Haustechnik",
      title: "Jedes Rohr, jedes Kabel",
      text: "Wasser, Heizung, Strom und Kommunikation, jedes ein eigenes System. Setzen Sie die Geräte, verbinden Sie sie mit Rohren und Kabeln, und ordnen Sie die Stromkreise im Verteiler zu. Grundriss zählt jedes Gerät und misst jede Leitung.",
    },
    heat: {
      kicker: "Wärme",
      title: "Wo die Wärme hingeht",
      text: "Geben Sie Wänden, Dach und Boden ihren Aufbau, und Sie erhalten die U-Werte, die Wärmebrücken und die Heizlast jedes Raums – mit Lüftung und Wärmerückgewinnung. Mit dem Klima Ihres Standorts kommen der Heizwärmebedarf pro Jahr samt Warmwasser und eine Prüfung auf sommerliche Überhitzung dazu. Die Farben zeigen die Vorlauftemperatur, die die Heizkörper jedes Raums brauchen: Bis 45 °C passt gut zu einer Wärmepumpe.",
      note: "Schätzwerte für die Planung – kein Energieausweis.",
    },
    sun: {
      kicker: "Sonne",
      title: "Die Sonne einfangen",
      text: "Belegen Sie Dachflächen mit Modulen, oder stellen Sie sie auf dem Flachdach auf Gestelle. Grundriss zieht den Schatten von Schornsteinen, Gauben und anderen Dächern ab. Mit dem Klima Ihres Standorts bilanziert es jede Stunde des Jahres: was das Haus selbst verbraucht, was der Speicher aufnimmt und was ins Netz geht.",
    },
    renovate: {
      kicker: "Sanierung",
      title: "Erst vergleichen, dann investieren",
      text: "Stellen Sie Varianten aus Maßnahmen zusammen – Dämmung, Dreifachverglasung, Wärmepumpe, Photovoltaik, Speicher – und vergleichen Sie sie mit dem Bestand. Jede Variante bekommt eine Kostenschätzung mit Preisen aus Österreich oder Deutschland, eine Förderschätzung für Deutschland (BEG), die Energiekosten pro Jahr und die Amortisationszeit mit Zinsen und Preissteigerung.",
      note: "Grobe Schätzungen. Das letzte Wort haben ein echtes Angebot und die Energieberatung.",
    },
    visit: {
      kicker: "Vor Ort",
      title: "Mit zur Besichtigung",
      text: "Installieren Sie Grundriss als App auf dem Handy, dem Tablet oder dem Laptop – dann funktioniert es auch offline. Heften Sie Notizen und Fotos an eine Wand, ein Fenster oder einen Raum: die feuchte Ecke, den alten Kessel, den Zähler. Jedes Projekt speichert sich nach jeder Änderung im Browser, mit Papierkorb und Sicherung als ZIP-Datei. Auf dem Handy liegt das Panel unten als Blatt, und zwei Finger zoomen den Plan.",
    },
    export: {
      kicker: "Export",
      title: "Überallhin mitnehmen",
      text: "Drucken Sie den Plan als PDF in einem üblichen Maßstab wie 1:50 oder 1:100, öffnen Sie ihn als DXF im CAD, oder bringen Sie das Haus als glTF nach Blender. Ein PDF-Bericht fasst Räume, Energie und Sanierung für die Energieberatung oder die Bank zusammen, und die Mengen gehen als CSV in die Tabellenkalkulation. Ein .grundriss-Paket enthält alles.",
    },
  },
  finale: {
    title: "Fangen Sie heute Abend an.",
    lead: "Grundriss läuft in Ihrem Browser. Nichts zu installieren, kein Konto und kein Server: Ihre Pläne bleiben auf Ihrem Gerät.",
    open: "Grundriss öffnen",
    facts: [
      {
        title: "Im Browser",
        text: "TypeScript, Three.js, OpenCV und ONNX Runtime – ohne Server. Als App installiert, funktioniert es offline.",
      },
      {
        title: "Privat",
        text: "Ihr Plan geht an keinen Server. Ihren Standort sendet die App nur, wenn Sie das Klima oder die Karte laden.",
      },
      {
        title: "Open Source",
        text: "MPL-2.0. Lesen Sie den Code, melden Sie einen Fehler, oder schicken Sie einen Pull Request.",
      },
      {
        title: "Ehrliche Zahlen",
        text: "Jede Zahl auf dieser Seite kommt aus dem Rechenkern der App. Energie- und Kostenwerte sind Schätzungen für die Planung, kein Energieausweis.",
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
    ["Bath", "Boiler von 1994 – siehe Foto"],
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
