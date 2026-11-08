// The German texts of a part of the app. See src/i18n/index.ts.

export const PROJECTS: Record<string, string> = {
  // The lock and the autosave
  "This plan is open in another tab, so this tab does not save it in the browser. Close the other tab, or save a copy to a file.":
    "Dieser Plan ist in einem anderen Tab offen, daher speichert dieser Tab ihn nicht im Browser. Schließen Sie den anderen Tab, oder speichern Sie eine Kopie in eine Datei.",
  "The storage of the browser is {percent} % full. Back up the projects on the Projects page, and delete old ones.":
    "Der Speicher des Browsers ist zu {percent} % voll. Sichern Sie die Projekte auf der Projektseite, und löschen Sie alte Projekte.",
  "The browser did not save the project: {error}. Save it to a file, and back up the projects on the Projects page.":
    "Der Browser hat das Projekt nicht gespeichert: {error}. Speichern Sie es in eine Datei, und sichern Sie die Projekte auf der Projektseite.",
  "The plan has unsaved changes. Discard them?":
    "Der Plan hat ungespeicherte Änderungen. Änderungen verwerfen?",

  // Open a plan
  "Opened {name}.": "{name} geöffnet.",
  "The project is not in the browser any more.": "Das Projekt ist nicht mehr im Browser.",
  "Example house": "Beispielhaus",
  "Opened the example house. A change saves it as a project in the browser.":
    "Das Beispielhaus ist geöffnet. Eine Änderung speichert es als Projekt im Browser.",
  "just now": "gerade eben",

  // The home page
  "This browser does not store projects, for example in a private window. Save the plan to a file to keep it.":
    "Dieser Browser speichert keine Projekte, zum Beispiel in einem privaten Fenster. Speichern Sie den Plan in eine Datei, um ihn zu behalten.",
  "The browser cannot read the projects: {error}":
    "Der Browser kann die Projekte nicht lesen: {error}",
  "The browser can delete these plans after a long time without a visit.":
    "Der Browser kann diese Pläne löschen, wenn Sie die Seite lange nicht besuchen.",
  "Install the app, or back up the plans.": "Installieren Sie die App, oder sichern Sie die Pläne.",
  "The storage is {percent} % full.": "Der Speicher ist zu {percent} % voll.",

  // The backup
  "There are no projects to back up.": "Es gibt keine Projekte zum Sichern.",
  "Grundriss backup {date}.zip": "Grundriss-Sicherung {date}.zip",
  "ZIP archive": "ZIP-Archiv",
  "Backed up {count} projects.": "{count} Projekte gesichert.",
  "Restored {count} projects.": "{count} Projekte wiederhergestellt.",
  "Restored {count} of {total} projects. The others are newer in the browser, open now, or damaged.":
    "{count} von {total} Projekten wiederhergestellt. Die anderen sind im Browser neuer, gerade geöffnet oder beschädigt.",

  // The list of the projects
  "No plans yet. A plan that you start or open shows here, and each change saves it.":
    "Noch keine Pläne. Ein Plan, den Sie beginnen oder öffnen, erscheint hier, und jede Änderung speichert ihn.",
  "New plan": "Neuer Plan",
  "Draw the walls, or trace a scan or a photo.":
    "Zeichnen Sie die Wände, oder zeichnen Sie einen Scan oder ein Foto nach.",
  "Open a file": "Datei öffnen",
  "A .grundriss or a .json file.": "Eine .grundriss- oder .json-Datei.",
  "Open {name}": "{name} öffnen",
  "A house with two stories, a roof, PV, and utilities. A change saves a copy.":
    "Ein Haus mit zwei Geschossen, Dach, PV und Haustechnik. Eine Änderung speichert eine Kopie.",
  "Changed {time}": "Geändert {time}",
  Rename: "Umbenennen",
  Duplicate: "Duplizieren",
  Delete: "Löschen",
  "Moved {name} to the trash. It stays there for {days} days.":
    "{name} ist im Papierkorb. Es bleibt dort {days} Tage.",
  "Back up all projects": "Alle Projekte sichern",
  "Restore a backup": "Sicherung wiederherstellen",
  "Trash · {count}": "Papierkorb · {count}",
  Restore: "Wiederherstellen",
  "Delete for good": "Endgültig löschen",
  'Delete "{name}" for good? This cannot be undone.':
    "„{name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.",
  "Name of the project": "Name des Projekts",
  "{name} (copy)": "{name} (Kopie)",
  "Another tab with an older version of Grundriss blocks the storage. Close it, and load this page again.":
    "Ein anderer Tab mit einer älteren Version von Grundriss blockiert den Speicher. Schließen Sie ihn, und laden Sie diese Seite neu.",
  "Your plans": "Ihre Pläne",
  "Draw a house or trace a scan, see it in 3D, and check its energy and a renovation. Your plans stay in this browser and save themselves after each change.":
    "Zeichnen Sie Ihr Haus, oder pausen Sie einen Scan ab, sehen Sie es in 3D, und prüfen Sie Energie und Sanierung. Ihre Pläne bleiben in diesem Browser und speichern sich nach jeder Änderung.",

  "Grundriss {version}": "Grundriss {version}",
  // remote.ts: the plans on a server.
  "The browser cannot keep the connection.": "Der Browser kann die Verbindung nicht speichern.",
  "The server has another version of the API ({server}; the app knows {app}). Update the older one.":
    "Der Server hat eine andere API-Version ({server}; die App kennt {app}). Aktualisieren Sie den älteren Teil.",
  "can edit": "kann bearbeiten",
  "can view": "kann ansehen",
  "makes plans": "legt Pläne an",
  "sees all plans": "sieht alle Pläne",
  "adds users": "fügt Benutzer hinzu",
  "until {date}": "bis {date}",
  "no end": "unbefristet",
  Root: "Root",
  "Shared plan": "Geteilter Plan",
  'Opened "{name}" on {server}. Each change saves to the server.':
    "„{name}“ auf {server} geöffnet. Jede Änderung wird auf dem Server gespeichert.",
  "{holder} edits this plan. You see it, and it updates itself.":
    "{holder} bearbeitet diesen Plan. Sie sehen ihn, und er aktualisiert sich selbst.",
  'Opened "{name}" on {server} to view.': "„{name}“ auf {server} zum Ansehen geöffnet.",
  Somebody: "Jemand",
  "Somebody else edits the plan now. You see it, and it updates itself.":
    "Jetzt bearbeitet jemand anderes den Plan. Sie sehen ihn, und er aktualisiert sich selbst.",
  "The plan is gone from the server. Save a copy to keep it.":
    "Der Plan ist nicht mehr auf dem Server. Speichern Sie eine Kopie, um ihn zu behalten.",
  "Somebody else edits the plan now. Save a copy to keep your changes.":
    "Jetzt bearbeitet jemand anderes den Plan. Speichern Sie eine Kopie, um Ihre Änderungen zu behalten.",
  "The server did not save the plan: {error}": "Der Server hat den Plan nicht gespeichert: {error}",
  "Somebody saved a newer version of this plan. OK loads it. Cancel keeps your version as a copy in this browser.":
    "Jemand hat eine neuere Version dieses Plans gespeichert. OK lädt sie. Abbrechen behält Ihre Version als Kopie in diesem Browser.",
  "The plan is now a copy in this browser, without the server.":
    "Der Plan ist jetzt eine Kopie in diesem Browser, ohne Server.",
  "Saving…": "Speichert…",
  "Not saved": "Nicht gespeichert",
  "{holder} edits": "{holder} bearbeitet",
  "View only": "Nur ansehen",
  "This plan is on the server {server}, revision {revision}. Click for more.":
    "Dieser Plan liegt auf dem Server {server}, Version {revision}. Klicken für mehr.",
  "No end": "Unbefristet",
  "1 day": "1 Tag",
  "7 days": "7 Tage",
  "30 days": "30 Tage",
  "A date…": "Ein Datum…",
  Ends: "Endet",
  "The link, shown only now. Copy it and send it on a safe way:":
    "Der Link, nur jetzt sichtbar. Kopieren Sie ihn und schicken Sie ihn auf sicherem Weg:",
  Link: "Link",
  "Link for this app": "Link für diese App",
  Copied: "Kopiert",
  "Connect a server": "Server verbinden",
  "Paste the link that you got from the owner of a Grundriss server, for example https://example.org/abc…. The link is your access, so keep it like a password.":
    "Fügen Sie den Link ein, den Sie vom Betreiber eines Grundriss-Servers bekommen haben, zum Beispiel https://example.org/abc…. Der Link ist Ihr Zugang, behandeln Sie ihn wie ein Passwort.",
  Connect: "Verbinden",
  "Connected to {server}.": "Mit {server} verbunden.",
  "On {server}, revision {revision}.": "Auf {server}, Version {revision}.",
  "You edit this plan. Each change saves to the server.":
    "Sie bearbeiten diesen Plan. Jede Änderung wird auf dem Server gespeichert.",
  "Nobody edits this plan.": "Niemand bearbeitet diesen Plan.",
  "Your link can only view this plan.": "Ihr Link kann diesen Plan nur ansehen.",
  "Load again": "Neu laden",
  "Save a copy in this browser": "Kopie in diesem Browser speichern",
  "Share…": "Teilen…",
  'Share "{name}"': "„{name}“ teilen",
  "A link gives access to this one plan, without an account: to view it, or to edit it. It ends at its date, or when you remove it.":
    "Ein Link gibt Zugang zu genau diesem Plan, ohne Konto: zum Ansehen oder zum Bearbeiten. Er endet an seinem Datum oder wenn Sie ihn entfernen.",
  "For example: Architect": "Zum Beispiel: Architektin",
  "Can view": "Kann ansehen",
  "Can edit": "Kann bearbeiten",
  Access: "Zugriff",
  "Make a link": "Link erstellen",
  "Links of this plan": "Links dieses Plans",
  "None yet.": "Noch keine.",
  "Remove the access of {label}": "Zugang von {label} entfernen",
  "Server settings": "Server-Einstellungen",
  Users: "Benutzer",
  "Name of the server": "Name des Servers",
  "Version {version}, mode {mode}, {plans} plans, {tokens} tokens.":
    "Version {version}, Modus {mode}, {plans} Pläne, {tokens} Zugänge.",
  "Each user gets an own link. A user sees the own plans, and the plans of others only with the right to see all plans. Removing a user also removes the links that the user made.":
    "Jeder Benutzer bekommt einen eigenen Link. Ein Benutzer sieht seine eigenen Pläne, die Pläne anderer nur mit dem Recht, alle Pläne zu sehen. Wer einen Benutzer entfernt, entfernt auch die Links, die dieser erstellt hat.",
  "For example: Anna": "Zum Beispiel: Anna",
  "Can make plans": "Kann Pläne anlegen",
  "Sees all plans": "Sieht alle Pläne",
  "Can add users": "Kann Benutzer hinzufügen",
  "Add the user": "Benutzer hinzufügen",
  "A user needs a name.": "Ein Benutzer braucht einen Namen.",
  "Copy: the plan stays here too": "Kopieren: der Plan bleibt auch hier",
  '"{name}" to a server': "„{name}“ auf einen Server",
  "On a server, each change saves to the server, and you can share the plan with links.":
    "Auf einem Server wird jede Änderung dort gespeichert, und Sie können den Plan mit Links teilen.",
  Server: "Server",
  "Move: the plan goes to the trash of this browser":
    "Verschieben: der Plan kommt in den Papierkorb dieses Browsers",
  "Put on the server": "Auf den Server legen",
  '"{name}" is on {server} now.': "„{name}“ liegt jetzt auf {server}.",
  '"{name}" to this browser': "„{name}“ in diesen Browser",
  "The plan becomes a project of this browser, without the server. Its links on the server do not come with it.":
    "Der Plan wird ein Projekt dieses Browsers, ohne Server. Seine Links auf dem Server kommen nicht mit.",
  "Move: the plan goes away from the server, for everybody":
    "Verschieben: der Plan verschwindet vom Server, für alle",
  "Put in this browser": "In diesen Browser holen",
  '"{name}" is in this browser now.': "„{name}“ ist jetzt in diesem Browser.",
  "New plan on this server": "Neuer Plan auf diesem Server",
  "Remove the connection": "Verbindung entfernen",
  "Remove the connection to {server}? Keep its link to connect again.":
    "Verbindung zu {server} entfernen? Behalten Sie den Link, um sich wieder zu verbinden.",
  "No plans on this server yet.": "Noch keine Pläne auf diesem Server.",
  "Changed {time} by {by}": "{time} geändert von {by}",
  Share: "Teilen",
  "Copy or move to this browser": "In diesen Browser kopieren oder verschieben",
  'Delete "{name}" on the server for everybody?': "„{name}“ auf dem Server für alle löschen?",
  "{holder} edits this plan, so you can only view it.":
    "{holder} bearbeitet diesen Plan, darum können Sie ihn nur ansehen.",
  "This plan is only to view. Click the mark of the server for more.":
    "Dieser Plan ist nur zum Ansehen. Klicken Sie auf die Server-Marke für mehr.",
  "Copy or move to a server": "Auf einen Server kopieren oder verschieben",
  "Share the plan with a link, or put it on a server":
    "Den Plan mit einem Link teilen oder auf einen Server legen",
};
