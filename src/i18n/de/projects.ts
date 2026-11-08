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
  "The projects stay in this browser on this device, and each change saves itself. Save to a file to share a plan, and back up all projects from time to time.":
    "Die Projekte bleiben in diesem Browser auf diesem Gerät, und jede Änderung speichert sich selbst. Speichern Sie einen Plan in eine Datei, um ihn weiterzugeben, und sichern Sie alle Projekte von Zeit zu Zeit.",
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
  "Plans in this browser": "Pläne in diesem Browser",
  Examples: "Beispiele",
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
  Backup: "Sicherung",
  "Back up all projects": "Alle Projekte sichern",
  "One ZIP file with all plans.": "Eine ZIP-Datei mit allen Plänen.",
  "Restore a backup": "Sicherung wiederherstellen",
  "Read the plans of a backup ZIP file.": "Liest die Pläne aus einer ZIP-Datei einer Sicherung.",
  "Trash · {count}": "Papierkorb · {count}",
  Restore: "Wiederherstellen",
  "Delete for good": "Endgültig löschen",
  'Delete "{name}" for good? This cannot be undone.':
    "„{name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.",
  "Name of the project": "Name des Projekts",
  "{name} (copy)": "{name} (Kopie)",
  "Another tab with an older version of Grundriss blocks the storage. Close it, and load this page again.":
    "Ein anderer Tab mit einer älteren Version von Grundriss blockiert den Speicher. Schließen Sie ihn, und laden Sie diese Seite neu.",
};
