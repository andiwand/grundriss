// The German texts of a part of the app. See src/i18n/index.ts.
// This part: the topics Energy, Renovation, and Utilities, the PDF report, and the CSV files.

export const ENERGY: Record<string, string> = {
  // src/ui/energy.ts: the PV summary and the location.
  Photovoltaic: "Photovoltaik",
  "{count} panels": "{count} Module",
  "per year": "pro Jahr",
  "Change the PV fields": "PV-Felder ändern",
  "Type at least two letters of the place.": "Geben Sie mindestens zwei Buchstaben des Orts ein.",
  "Searching the place…": "Ort wird gesucht…",
  'Found no place for "{query}".': "Kein Ort für „{query}“ gefunden.",
  "Loading {years} years of weather data from open-meteo.com…":
    "Wetterdaten von {years} Jahren werden von open-meteo.com geladen…",
  "The location changed during the download. Load the climate again.":
    "Der Standort hat sich während des Downloads geändert. Laden Sie das Klima erneut.",
  "Loaded the climate. The plan stores it, so the app needs no network for it now.":
    "Das Klima ist geladen. Der Plan speichert es, die App braucht dafür jetzt kein Netzwerk mehr.",
  "Stopped the download.": "Download abgebrochen.",
  Location: "Standort",
  "Place · {name}": "Ort · {name}",
  Place: "Ort",
  "Town or city": "Ort oder Stadt",
  Search: "Suchen",
  Name: "Name",
  Latitude: "Breitengrad",
  Longitude: "Längengrad",
  Done: "Fertig",
  "Move the map": "Karte verschieben",
  "Plan point x": "Planpunkt x",
  "Plan point y": "Planpunkt y",
  "The plan point is at the latitude and the longitude. Move the map, or change the plan point and North, until the map fits the plan.":
    "Der Planpunkt liegt auf dem Breiten- und dem Längengrad. Verschieben Sie die Karte oder ändern Sie den Planpunkt und Norden, bis die Karte zum Plan passt.",
  Stop: "Abbrechen",
  "Load the climate again": "Klima erneut laden",
  "Load climate": "Klima laden",
  "Search and Load climate send the place to open-meteo.com. The app sends nothing before you click. The plan stores the climate, so it works offline after that.":
    "„Suchen“ und „Klima laden“ senden den Ort an open-meteo.com. Vor Ihrem Klick sendet die App nichts. Der Plan speichert das Klima, danach funktioniert es auch offline.",

  // The climate.
  "The climate is for {place}. Load it again for the new location.":
    "Das Klima gilt für {place}. Laden Sie es für den neuen Standort erneut.",
  "mean temperature": "mittlere Temperatur",
  "design temperature": "Normaußentemperatur",
  "degree days {base}/{limit}": "Heizgradtage {base}/{limit}",
  "sun on the ground per year": "Sonne auf den Boden pro Jahr",
  "PV on the best roof face ({direction} {tilt}°)":
    "PV auf der besten Dachfläche ({direction} {tilt}°)",
  "PV at the best tilt ({direction} {tilt}°)": "PV bei der besten Neigung ({direction} {tilt}°)",
  "Climate {first} to {last}": "Klima {first} bis {last}",
  "A typical year: the mean of each hour of {first} to {last}, loaded on {date}. The design temperature is the coldest mean of 48 hours in these years. The degree days count the days below {limit} °C against {base} °C inside.":
    "Ein typisches Jahr: der Mittelwert jeder Stunde von {first} bis {last}, geladen am {date}. Die Normaußentemperatur ist das kälteste Mittel über 48 Stunden in diesen Jahren. Die Heizgradtage zählen die Tage unter {limit} °C gegen {base} °C innen.",
  "Remove the climate": "Klima entfernen",
  "Outside is the design temperature of the location.":
    "Außen ist die Normaußentemperatur des Standorts.",
  "Use {value} °C of the location": "{value} °C des Standorts verwenden",
  "The yield comes from the climate of the location, without shade.":
    "Der Ertrag kommt aus dem Klima des Standorts, ohne Verschattung.",
  "The yield is a general estimate for Central Europe. Load the climate of the location for a better value.":
    "Der Ertrag ist ein allgemeiner Schätzwert für Mitteleuropa. Laden Sie das Klima des Standorts für einen besseren Wert.",

  // The heat loss and the envelope.
  "Heat loss": "Heizlast",
  "heat loss": "Heizlast",
  "per gross floor area": "pro Bruttogrundfläche",
  "gross floor area (BGF)": "Bruttogrundfläche (BGF)",
  "net floor area": "Nettogrundfläche",
  "At {outside} °C outside and {inside} °C inside. An estimate, not a calculation by a standard. Click a room or a wall on the plan for its own values.":
    "Bei {outside} °C außen und {inside} °C innen. Eine Schätzung, keine Berechnung nach Norm. Klicken Sie auf einen Raum oder eine Wand im Plan für deren eigene Werte.",
  Envelope: "Gebäudehülle",
  "Outer walls": "Außenwände",
  Roof: "Dach",
  "Floor on the ground": "Boden gegen Erdreich",
  "Slab to an unheated story": "Decke zu einem unbeheizten Geschoss",
  "Heated stories · {heated} of {count}": "Beheizte Geschosse · {heated} von {count}",
  "An unheated story, for example a cold cellar or attic, loses no heat. The heated rooms next to it lose heat through the slab between them.":
    "Ein unbeheiztes Geschoss, zum Beispiel ein kalter Keller oder Dachboden, verliert keine Wärme. Die beheizten Räume daneben verlieren Wärme über die Decke dazwischen.",
  "Thermal bridges and air": "Wärmebrücken und Luft",
  "Thermal bridges ΔU": "Wärmebrücken ΔU",
  "Air change": "Luftwechsel",
  "Airtightness n50": "Luftdichtheit n50",
  "Heat recovery": "Wärmerückgewinnung",
  "The thermal bridges add ΔU on all areas of the envelope: {careless} without a check, {careful} for a careful design, 0 for a design without bridges. A ventilation system with heat recovery takes back its part of the heat of the air, but the leaks (n50 × {leak}) add. The air that loses heat: {air} per hour.":
    "Die Wärmebrücken addieren ΔU auf alle Flächen der Gebäudehülle: {careless} ohne Nachweis, {careful} bei sorgfältiger Planung, 0 bei einer Planung ohne Wärmebrücken. Eine Lüftungsanlage mit Wärmerückgewinnung holt ihren Anteil der Wärme aus der Luft zurück, aber die Undichtheiten (n50 × {leak}) kommen dazu. Die Luft, die Wärme verliert: {air} pro Stunde.",
  "Windows, doors, and climate": "Fenster, Türen und Klima",
  "Window U": "U-Wert Fenster",
  "Door U": "U-Wert Tür",
  Outside: "Außen",
  Inside: "Innen",

  // The heating.
  Heating: "Heizung",
  Efficiency: "Wirkungsgrad",
  Source: "Quelle",
  "Outside air": "Außenluft",
  Ground: "Erdreich",
  "Flow temperature": "Vorlauftemperatur",
  "From the radiators": "Aus den Heizkörpern",
  Fixed: "Fest",
  "Design flow": "Auslegungs-Vorlauf",
  "Fixed performance factor": "Feste Leistungszahl",
  "Performance factor": "Leistungszahl",
  "The heat pump has a seasonal performance factor of about {spf}, at the design flow that the radiators need ({flow} °C). Each hour has its own performance from the flow and the source temperature.":
    "Die Wärmepumpe hat eine Jahresarbeitszahl (JAZ) von etwa {spf}, beim Auslegungs-Vorlauf, den die Heizkörper brauchen ({flow} °C). Jede Stunde hat ihre eigene Leistungszahl aus dem Vorlauf und der Quellentemperatur.",
  "The heat pump has a seasonal performance factor of about {spf}, at the design flow that you set ({flow} °C). Each hour has its own performance from the flow and the source temperature.":
    "Die Wärmepumpe hat eine Jahresarbeitszahl (JAZ) von etwa {spf}, beim Auslegungs-Vorlauf, den Sie eingestellt haben ({flow} °C). Jede Stunde hat ihre eigene Leistungszahl aus dem Vorlauf und der Quellentemperatur.",
  "The heat pump has a seasonal performance factor of about {spf}, at the design flow of 45 °C, because no room has a radiator with a power ({flow} °C). Each hour has its own performance from the flow and the source temperature.":
    "Die Wärmepumpe hat eine Jahresarbeitszahl (JAZ) von etwa {spf}, beim Auslegungs-Vorlauf von 45 °C, weil kein Raum einen Heizkörper mit Leistung hat ({flow} °C). Jede Stunde hat ihre eigene Leistungszahl aus dem Vorlauf und der Quellentemperatur.",
  "The heat pump has the fixed factor {factor}.":
    "Die Wärmepumpe hat die feste Leistungszahl {factor}.",
  "Performance factor {value}": "Leistungszahl {value}",
  "Ground source, calculated performance": "Erdreich als Quelle, berechnete Leistungszahl",
  "Air source, calculated performance": "Luft als Quelle, berechnete Leistungszahl",
  "Efficiency {value}": "Wirkungsgrad {value}",
  "{detail} · change it in Utilities": "{detail} · in Haustechnik ändern",
  // The system name "Electricity" is "Elektro" (glossary); the heading of the energy uses it too.
  Electricity: "Elektro",
  "The heating uses the price of electricity of the Electricity group.":
    "Die Heizung verwendet den Strompreis aus der Gruppe „Elektro“.",
  "Price of {energy}": "Preis für {energy}",

  // The hot water.
  "Hot water": "Warmwasser",
  People: "Personen",
  "Per person and day": "Pro Person und Tag",
  Heater: "Erzeugung",
  "Direct electric": "Direktstrom",
  "Water from 10 °C to 55 °C, and {loss} % more for the losses of the storage and the pipes. 0 people leaves the hot water out.":
    "Wasser von 10 °C auf 55 °C, und {loss} % mehr für die Verluste von Speicher und Leitungen. Bei 0 Personen entfällt das Warmwasser.",

  // The heating per year.
  "Heating per year": "Heizung pro Jahr",
  "Draw rooms to calculate the energy per year.":
    "Zeichnen Sie Räume, um die Energie pro Jahr zu berechnen.",
  "Load the climate in the Location group to calculate the energy per year.":
    "Laden Sie das Klima in der Gruppe „Standort“, um die Energie pro Jahr zu berechnen.",
  "heat demand per year": "Heizwärmebedarf (HWB) pro Jahr",
  "class (an estimate, not a certificate)": "Klasse (Schätzwert, kein Energieausweis)",
  "{energy} for the heating": "{energy} für die Heizung",
  "{energy} for the hot water": "{energy} für das Warmwasser",
  "CO₂ per year": "CO₂ pro Jahr",
  "of the electricity from your PV, in the balance of each month":
    "des Stroms aus Ihrer PV, in der Bilanz jedes Monats",
  "seasonal performance factor": "Jahresarbeitszahl (JAZ)",
  "A monthly balance in the spirit of EN ISO 13790, with the stored climate: the heat loss of the heated rooms, the sun through the windows, and {gains} W/m² from people and devices. The cost and the CO₂ include the hot water. The energy per m² uses the gross floor area. The class uses the heat demand on the scale of the Austrian energy certificate (OIB), but it is an estimate, not a certificate: the certificate uses a reference climate and more details. The PV share is an upper limit, because PV in the day does not heat at night without a battery.":
    "Eine Monatsbilanz in Anlehnung an EN ISO 13790, mit dem gespeicherten Klima: die Wärmeverluste der beheizten Räume, die Sonne durch die Fenster und {gains} W/m² von Personen und Geräten. Die Kosten und das CO₂ enthalten das Warmwasser. Die Energie pro m² bezieht sich auf die Bruttogrundfläche. Die Klasse bewertet den Heizwärmebedarf auf der Skala des österreichischen Energieausweises (OIB), ist aber ein Schätzwert und kein Energieausweis: Der Energieausweis verwendet ein Referenzklima und mehr Details. Der PV-Anteil ist eine Obergrenze, denn PV-Strom vom Tag heizt ohne Batteriespeicher nicht in der Nacht.",

  // The electricity.
  "Household per year": "Haushalt pro Jahr",
  Battery: "Batteriespeicher",
  "Price from the grid": "Preis aus dem Netz",
  "Payment for feed-in": "Vergütung für Einspeisung",
  "The household electricity is without the heating and the hot water. The price from the grid is also the price of an electric heating.":
    "Der Haushaltsstrom ist ohne Heizung und Warmwasser. Der Preis aus dem Netz ist auch der Preis einer elektrischen Heizung.",
  "Electricity per year": "Strom pro Jahr",
  "Load the climate in the Location group for the hourly balance.":
    "Laden Sie das Klima in der Gruppe „Standort“ für die Stundenbilanz.",
  "electricity of the building": "Strom des Gebäudes",
  "from the grid": "aus dem Netz",
  "PV yield": "PV-Ertrag",
  "to the grid": "ins Netz",
  "of the PV used in the building": "der PV im Gebäude genutzt (Eigenverbrauch)",
  "of the electricity from the PV": "des Stroms aus der PV (Autarkiegrad)",
  "energy cost per year": "Energiekosten pro Jahr",
  "household {value}": "Haushalt {value}",
  "heating {value}": "Heizung {value}",
  "hot water {value}": "Warmwasser {value}",
  "from the battery {value}": "aus dem Batteriespeicher {value}",
  "{parts}. An hourly balance of the typical year: the PV of each hour against a usual day of a household, the heating by the temperature of the hour, and the hot water from 6:00 to 22:00. The energy cost is the electricity from the grid, minus the feed-in, plus the fuel of a heating without electricity.":
    "{parts}. Eine Stundenbilanz des typischen Jahres: die PV jeder Stunde gegen einen üblichen Tag eines Haushalts, die Heizung nach der Temperatur der Stunde und das Warmwasser von 6:00 bis 22:00. Die Energiekosten sind der Strom aus dem Netz, minus die Einspeisung, plus der Brennstoff einer Heizung ohne Strom.",
  "Compare renovations": "Sanierungen vergleichen",

  // The heat pump readiness.
  Room: "Raum",
  "Heat pump readiness": "Wärmepumpen-Eignung",
  "No room has a radiator with a power or floor heating. Add the radiators in Utilities with their power at 75/65/20 °C, or mark the floor heating of the rooms.":
    "Kein Raum hat einen Heizkörper mit Leistung oder eine Fußbodenheizung. Fügen Sie die Heizkörper in Haustechnik mit ihrer Leistung bei 75/65/20 °C hinzu, oder markieren Sie die Fußbodenheizung der Räume.",
  good: "gut",
  fair: "mäßig",
  "too small": "zu klein",
  "no heating": "keine Heizung",
  "flow that the house needs": "Vorlauf, den das Haus braucht",
  "{ready} of {count}": "{ready} von {count}",
  "rooms ready at {flow} °C": "Räume bereit bei {flow} °C",
  Loss: "Verlust",
  "At 45 °C": "Bei 45 °C",
  Needs: "Braucht",
  "A heat pump works well up to a flow of {good} °C, and acceptably up to {fair} °C. A room that needs more gets a larger radiator, or the house gets more insulation. The power of a radiator is its power at 75/65/20 °C (EN 442), with the exponent {exponent}.":
    "Eine Wärmepumpe arbeitet gut bis zu einem Vorlauf von {good} °C und akzeptabel bis {fair} °C. Ein Raum, der mehr braucht, bekommt einen größeren Heizkörper, oder das Haus bekommt mehr Dämmung. Die Leistung eines Heizkörpers ist seine Leistung bei 75/65/20 °C (EN 442), mit dem Exponenten {exponent}.",

  // The summer.
  Summer: "Sommer",
  "Load the climate in the Location group for the summer check.":
    "Laden Sie das Klima in der Gruppe „Standort“ für die Sommerprüfung.",
  "External blinds": "Außenjalousien",
  ok: "ok",
  warm: "warm",
  "too hot": "zu heiß",
  Glass: "Glas",
  Max: "Max.",
  "An estimate in the spirit of ÖNORM B 8110-3 and DIN 4108-2, not the procedure of the standard: each room is one node with its mass, the sun through its windows, people and devices, and open windows when the outside is cooler. The verdict uses the degree hours over 27 °C (1200 K·h is the limit for homes). Glass is the area of the windows per floor area.":
    "Ein Schätzwert in Anlehnung an ÖNORM B 8110-3 und DIN 4108-2, nicht das Verfahren der Norm: Jeder Raum ist ein Knoten mit seiner Masse, der Sonne durch seine Fenster, Personen und Geräten sowie offenen Fenstern, wenn es außen kühler ist. Die Bewertung verwendet die Gradstunden über 27 °C (1200 K·h ist die Grenze für Wohnungen). Glas ist die Fensterfläche pro Bodenfläche.",

  // src/ui/renovation.ts
  Renovation: "Sanierung",
  "The renovation compares the energy cost per year, so it needs the climate. Load it in the Location group of Energy.":
    "Die Sanierung vergleicht die Energiekosten pro Jahr und braucht daher das Klima. Laden Sie es in der Gruppe „Standort“ im Bereich Energie.",
  "Open Energy": "Energie öffnen",
  "energy cost per year now": "Energiekosten pro Jahr jetzt",
  "heat demand": "Heizwärmebedarf (HWB)",
  "heat demand: draw rooms": "Heizwärmebedarf: Räume zeichnen",
  Prices: "Preise",
  "Austria, 2025": "Österreich, 2025",
  "Germany, 2025": "Deutschland, 2025",
  Interest: "Zinsen",
  "% per year": "% pro Jahr",
  "Energy prices": "Energiepreise",
  "Add a variant": "Variante hinzufügen",
  "Add a variant…": "Variante hinzufügen…",
  "Copy of the plan": "Kopie des Plans",
  New: "Neu",
  "A variant starts from the plan. Add measures to it, or open it and change it in all topics, also its walls and rooms: the changes go into the variant, and the plan stays. The check mark makes a variant the new plan. The cost is an estimate from usual prices of the region, without the scaffold. Type the price of a real offer to replace it. The payback time counts the interest and the change of the energy prices. For Germany, the app estimates the federal subsidy (BEG EM, 2025, without the bonus for the income and the iSFP). For Austria, the programs of the federal government and the states change often: see umweltfoerderung.at and your state, and type the amount. Check all rules before you decide.":
    "Eine Variante beginnt beim Plan. Fügen Sie ihr Maßnahmen hinzu, oder öffnen Sie sie und ändern Sie sie in allen Bereichen, auch ihre Wände und Räume: Die Änderungen gehen in die Variante, und der Plan bleibt. Das Häkchen macht eine Variante zum neuen Plan. Die Kosten sind eine Schätzung aus üblichen Preisen der Region, ohne Gerüst. Geben Sie den Preis eines echten Angebots ein, um sie zu ersetzen. Die Amortisation berücksichtigt die Zinsen und die Änderung der Energiepreise. Für Deutschland schätzt die App die Bundesförderung (BEG EM, 2025, ohne Einkommensbonus und iSFP). In Österreich ändern sich die Förderprogramme von Bund und Ländern oft: Sehen Sie auf umweltfoerderung.at und bei Ihrem Bundesland nach, und geben Sie den Betrag ein. Prüfen Sie alle Bedingungen, bevor Sie entscheiden.",
  "Name of the variant": "Name der Variante",
  "The plan has this variant": "Der Plan hat diese Variante",
  "Make this variant the plan": "Diese Variante zum Plan machen",
  "Open this variant to see and change it": "Diese Variante öffnen, um sie zu sehen und zu ändern",
  "Back to the plan": "Zurück zum Plan",
  'You see and edit the variant "{name}". The plan does not change.':
    "Sie sehen und bearbeiten die Variante „{name}“. Der Plan ändert sich nicht.",
  "You see and edit the plan.": "Sie sehen und bearbeiten den Plan.",
  'You see and edit the variant "{name}". The numbers below compare with the plan.':
    "Sie sehen und bearbeiten die Variante „{name}“. Die Zahlen unten vergleichen mit dem Plan.",
  "Another floor plan": "Anderer Grundriss",
  "Floor plan {count}": "Grundriss {count}",
  "Own floor plan: {rooms} rooms, {area} m² (the plan: {plan} rooms)":
    "Eigener Grundriss: {rooms} Räume, {area} m² (der Plan: {plan} Räume)",
  "A wall to remove can carry a load. Ask a structural engineer before you plan it.":
    "Eine Wand, die wegfällt, kann tragend sein. Fragen Sie einen Statiker, bevor Sie das planen.",
  "Remove walls, {area} m²": "Wände abbrechen, {area} m²",
  "New inner walls, {area} m²": "Neue Innenwände, {area} m²",
  "Cuts for new openings: {count}": "Wanddurchbrüche für neue Öffnungen: {count}",
  "New doors: {count}": "Neue Türen: {count}",
  "New windows, {area} m²": "Neue Fenster, {area} m²",
  "Close openings, {area} m²": "Öffnungen schließen, {area} m²",
  'The plan now has the variant "{name}". Undo goes back.':
    "Der Plan hat jetzt die Variante „{name}“. Rückgängig stellt den alten Stand her.",
  "Delete the variant": "Variante löschen",
  "Cost €": "Kosten €",
  "{amount} (estimate)": "{amount} (Schätzung)",
  "Subsidy €": "Förderung €",
  "Use the BEG estimate: {amount}": "BEG-Schätzung verwenden: {amount}",
  "{amount} energy cost per year": "{amount} Energiekosten pro Jahr",
  "No saving": "Keine Einsparung",
  "Saves {amount} per year": "Spart {amount} pro Jahr",
  "Costs {amount} per year": "Kostet {amount} mehr pro Jahr",
  "pays back at once": "amortisiert sich sofort",
  "pays back in more than 50 years": "amortisiert sich in mehr als 50 Jahren",
  "pays back in less than 1 year": "amortisiert sich in weniger als 1 Jahr",
  "pays back in {years} years": "amortisiert sich in {years} Jahren",
  "No changes against the plan": "Keine Änderungen gegenüber dem Plan",
  Estimate: "Schätzung",
  "Add a measure to the variant": "Maßnahme zur Variante hinzufügen",
  "Add a measure…": "Maßnahme hinzufügen…",

  // The cost items (costItemText) and the subsidy items of src/model/renovation.ts.
  "Insulation of the walls": "Dämmung der Wände",
  "Insulation of the roof": "Dämmung des Dachs",
  "Insulation of the slabs to unheated stories": "Dämmung der Decken zu unbeheizten Geschossen",
  "Insulation of the floor": "Dämmung des Bodens",
  "New windows": "Neue Fenster",
  "New heating: {kind}": "Neue Heizung: {kind}",
  "New hot water heater": "Neue Warmwasserbereitung",
  "PV, {peak} kWp": "PV, {peak} kWp",
  "Battery, {capacity} kWh": "Batteriespeicher, {capacity} kWh",
  "Heating (BEG EM)": "Heizung (BEG EM)",
  "Insulation and windows (BEG EM)": "Dämmung und Fenster (BEG EM)",

  // src/ui/utilities.ts
  "Quantities of the building": "Mengen des Gebäudes",
  "The lengths include the drops to the devices.":
    "Die Längen enthalten die Fallleitungen zu den Geräten.",
  "Add {system}": "{system} hinzufügen",
  "The pipes of cold water, hot water, and waste water, with the outlets, the drains, and the hot water tank.":
    "Die Leitungen für Kaltwasser, Warmwasser und Abwasser, mit den Entnahmestellen, den Abläufen und dem Warmwasserspeicher.",
  "The pipes of the heating, the radiators, the manifolds, and the heat source.":
    "Die Leitungen der Heizung, die Heizkörper, die Verteiler und der Wärmeerzeuger.",
  "The sockets, the switches, the lights, the cables, and the photovoltaic system.":
    "Die Steckdosen, die Schalter, die Leuchten, die Kabel und die Photovoltaikanlage.",
  "The network, phone, TV, and SAT sockets and cables.":
    "Die Netzwerk-, Telefon-, TV- und SAT-Dosen und -Kabel.",
  "Distribution board · {count} circuits": "Verteiler · {count} Stromkreise",
  "Click an electric device or a cable, and type its circuit, for example F3. The board then lists the devices and the cables of each circuit.":
    "Klicken Sie auf ein elektrisches Gerät oder ein Kabel und geben Sie seinen Stromkreis ein, zum Beispiel F3. Der Verteiler listet dann die Geräte und die Kabel jedes Stromkreises.",
  Circuit: "Stromkreis",
  Devices: "Geräte",
  Cable: "Kabel",
  "without a circuit": "ohne Stromkreis",
  Furniture: "Möbel",
  "pieces on {story}": "Möbelstücke: {story}",
  "pieces in the building": "Möbelstücke im Gebäude",
  "Open the furniture catalog": "Möbelkatalog öffnen",
  "Click a piece on the plan to move it, to turn it, or to change its size. R turns a selected piece.":
    "Klicken Sie auf ein Möbelstück im Plan, um es zu verschieben, zu drehen oder seine Größe zu ändern. R dreht ein ausgewähltes Möbelstück.",
  Rooms: "Räume",
  "Click a room to change its name, its height, and the color of its walls.":
    "Klicken Sie auf einen Raum, um seinen Namen, seine Höhe und die Farbe seiner Wände zu ändern.",
  "Field {number}": "Feld {number}",
  rack: "Aufständerung",
  "no face": "keine Dachfläche",
  "{peak} kWp, about {yield} per year.": "{peak} kWp, etwa {yield} pro Jahr.",
  "The roofs, the dormers, and the chimneys take {share} % of it with their shade (without shade: {yield}).":
    "Die Dächer, Gauben und Kamine nehmen durch ihre Verschattung {share} % davon weg (ohne Verschattung: {yield}).",
  "No shade from the roofs, the dormers, or the chimneys.":
    "Keine Verschattung durch Dächer, Gauben oder Kamine.",
  "The shade is an estimate without the climate.":
    "Die Verschattung ist ein Schätzwert ohne Klima.",
  Face: "Dachfläche",
  Mounting: "Montage",
  "Flat on the roof": "Flach auf dem Dach",
  "Rack, one direction": "Aufständerung, eine Richtung",
  "Rack, east-west": "Aufständerung, Ost-West",
  Tilt: "Neigung",
  "First half faces": "Erste Hälfte zeigt nach",
  Faces: "Zeigt nach",
  "° from N": "° von N",
  "Two panels lean back to back: one half faces the direction, and the other half the opposite direction. 90° is east.":
    "Je zwei Module lehnen Rücken an Rücken: Eine Hälfte zeigt in die Richtung, die andere in die Gegenrichtung. 90° ist Osten.",
  "180° is south. The rows keep a distance, so that a row does not shade the next row at noon on 21 December.":
    "180° ist Süden. Die Reihen halten Abstand, damit eine Reihe die nächste am 21. Dezember zu Mittag nicht verschattet.",
  "Panel power": "Modulleistung",
  Orientation: "Ausrichtung",
  Portrait: "Hochformat",
  Landscape: "Querformat",
  Margin: "Randabstand",
  "Most panels": "Höchstens Module",
  Remove: "Entfernen",
  "Add a PV field": "PV-Feld hinzufügen",
  Pipes: "Leitungen",
  Cables: "Kabel",
  unheated: "unbeheizt",

  // src/export/report.ts: the PDF report.
  Areas: "Flächen",
  "Gross floor area (heated)": "Bruttogrundfläche (beheizt)",
  "Net floor area (heated)": "Nettogrundfläche (beheizt)",
  "Living area (WoFlV), all rooms": "Wohnfläche (WoFlV), alle Räume",
  "Heated volume": "Beheiztes Volumen",
  Stories: "Geschosse",
  Story: "Geschoss",
  "Net area": "Nettofläche",
  "Living area": "Wohnfläche",
  Height: "Höhe",
  Heated: "Beheizt",
  yes: "ja",
  no: "nein",
  Part: "Bauteil",
  "Layers from the inside": "Schichten von innen",
  "U-value": "U-Wert",
  Area: "Fläche",
  Windows: "Fenster",
  "Thermal bridges": "Wärmebrücken",
  "heat recovery": "Wärmerückgewinnung",
  "Design temperatures": "Auslegungstemperaturen",
  Kind: "Art",
  Width: "Breite",
  Sill: "Brüstungshöhe",
  Count: "Anzahl",
  Door: "Tür",
  Window: "Fenster",
  "Heat loss and heating": "Heizlast und Heizung",
  "Heat loss (design)": "Heizlast (Auslegung)",
  "Per gross floor area": "Pro Bruttogrundfläche",
  "Flow that the radiators need": "Vorlauf, den die Heizkörper brauchen",
  "Radiators 75/65": "Heizkörper 75/65",
  "Heat pump": "Wärmepumpe",
  "Energy per year": "Energie pro Jahr",
  "The plan has no climate, so the report has no energy per year.":
    "Der Plan hat kein Klima, daher enthält der Bericht keine Energie pro Jahr.",
  "Heat demand": "Heizwärmebedarf (HWB)",
  "Class (an estimate)": "Klasse (Schätzwert)",
  "Final energy of the heating": "Endenergie der Heizung",
  "CO₂ of heating and hot water": "CO₂ von Heizung und Warmwasser",
  "Seasonal performance factor": "Jahresarbeitszahl (JAZ)",
  "Electricity of the building": "Strom des Gebäudes",
  "Electricity from the grid": "Strom aus dem Netz",
  "Energy cost per year": "Energiekosten pro Jahr",
  PV: "PV",
  panels: "Module",
  "Self-consumption": "Eigenverbrauch",
  "Self-sufficiency": "Autarkiegrad",
  "Glass per floor": "Glas pro Boden",
  "Hours > 27 °C": "Stunden > 27 °C",
  Highest: "Höchstwert",
  Verdict: "Bewertung",
  Variant: "Variante",
  Cost: "Kosten",
  Subsidy: "Förderung",
  "Energy cost": "Energiekosten",
  Saving: "Einsparung",
  Payback: "Amortisation",
  years: "Jahre",
  "Building services": "Haustechnik",
  Quantity: "Menge",
  "The values are estimates for planning. They are not a calculation by a standard and not an energy certificate.":
    "Die Werte sind Schätzwerte für die Planung. Sie sind keine Berechnung nach Norm und kein Energieausweis.",

  // src/export/csv.ts: the headers, the parts of the envelope, and the words of takeoffZip.
  "Net area m²": "Nettofläche m²",
  "Living area m²": "Wohnfläche m²",
  "Area on center lines m²": "Fläche auf Achsmaßen m²",
  "Height m": "Höhe m",
  "Perimeter m": "Umfang m",
  "Width m": "Breite m",
  "Sill m": "Brüstungshöhe m",
  "Area m²": "Fläche m²",
  Material: "Material",
  "Thickness m": "Dicke m",
  "Volume m³": "Volumen m³",
  Unit: "Einheit",
  "Outer walls without openings": "Außenwände ohne Öffnungen",
  "Slabs to unheated stories": "Decken zu unbeheizten Geschossen",
  "Gross floor area": "Bruttogrundfläche",
  "Net floor area": "Nettogrundfläche",
  pc: "Stk.",
};
