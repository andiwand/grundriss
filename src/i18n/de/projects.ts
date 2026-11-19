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
  "A .grundriss, .yaml, or .json file.": "Eine .grundriss-, .yaml- oder .json-Datei.",
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
  "In this browser": "In diesem Browser",
  "Draw a house or trace a scan, see it in 3D, and check its energy and a renovation. Your plans stay in this browser and save themselves after each change.":
    "Zeichnen Sie Ihr Haus, oder pausen Sie einen Scan ab, sehen Sie es in 3D, und prüfen Sie Energie und Sanierung. Ihre Pläne bleiben in diesem Browser und speichern sich nach jeder Änderung.",

  "Grundriss {version}": "Grundriss {version}",
  // remote.ts: the plans on a server.
  "can edit": "kann bearbeiten",
  "can view": "kann ansehen",
  "makes plans": "legt Pläne an",
  "sees all plans": "sieht alle Pläne",
  "until {date}": "bis {date}",
  "no end": "unbefristet",
  'Opened "{name}" on {server}. Each change saves to the server.':
    "„{name}“ auf {server} geöffnet. Jede Änderung wird auf dem Server gespeichert.",
  'Opened "{name}" on {server} to view.': "„{name}“ auf {server} zum Ansehen geöffnet.",
  "The plan is gone from the server. Save a copy to keep it.":
    "Der Plan ist nicht mehr auf dem Server. Speichern Sie eine Kopie, um ihn zu behalten.",
  "The server did not save the plan: {error}": "Der Server hat den Plan nicht gespeichert: {error}",
  "The plan is now a copy in this browser, without the server.":
    "Der Plan ist jetzt eine Kopie in diesem Browser, ohne Server.",
  "Saving…": "Speichert…",
  "Not saved": "Nicht gespeichert",
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
  Copied: "Kopiert",
  "On {server}, revision {revision}.": "Auf {server}, Version {revision}.",
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
  "Can make plans": "Kann Pläne anlegen",
  "Copy: the plan stays here too": "Kopieren: der Plan bleibt auch hier",
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
  "No plans on this server yet.": "Noch keine Pläne auf diesem Server.",
  "Changed {time} by {by}": "{time} geändert von {by}",
  Share: "Teilen",
  "Copy or move to this browser": "In diesen Browser kopieren oder verschieben",
  'Delete "{name}" on the server for everybody?': "„{name}“ auf dem Server für alle löschen?",
  "This plan is only to view. Click the mark of the server for more.":
    "Dieser Plan ist nur zum Ansehen. Klicken Sie auf die Server-Marke für mehr.",
  "Copy or move to a server": "Auf einen Server kopieren oder verschieben",
  "Share the plan with a link, or put it on a server":
    "Den Plan mit einem Link teilen oder auf einen Server legen",
  // versions.ts: the versions of a plan.
  "Saved to a file": "In eine Datei gespeichert",
  "Saved in the browser": "Im Browser gespeichert",
  "Before a restore": "Vor einer Wiederherstellung",
  "Revision {number}": "Version {number}",
  'Versions of "{name}"': "Versionen von „{name}“",
  "Restore gives the plan the state of a version; undo takes it back. Open as a copy makes a new plan in this browser.":
    "Wiederherstellen gibt dem Plan den Stand einer Version; Rückgängig nimmt das zurück. Als Kopie öffnen legt einen neuen Plan in diesem Browser an.",
  "Open as a copy makes a new plan in this browser.":
    "Als Kopie öffnen legt einen neuen Plan in diesem Browser an.",
  "No versions yet. The browser keeps one at each save to a file, and one every few minutes while you edit.":
    "Noch keine Versionen. Der Browser behält eine bei jedem Speichern in eine Datei und alle paar Minuten eine, während Sie bearbeiten.",
  "Open as a copy": "Als Kopie öffnen",
  "The version is a new plan in this browser now.":
    "Die Version ist jetzt ein neuer Plan in diesem Browser.",
  'The plan has the state of "{version}" again.': "Der Plan hat wieder den Stand von „{version}“.",
  "The plan has no versions yet. It saves to this browser after its first change.":
    "Der Plan hat noch keine Versionen. Er wird nach seiner ersten Änderung in diesem Browser gespeichert.",
  Versions: "Versionen",
  "Versions…": "Versionen…",
  "{name} changed on the disk since you opened it ({time}). OK saves your plan as a new file, and the other version stays. Cancel does not save.":
    "{name} wurde auf dem Datenträger geändert, seit Sie die Datei geöffnet haben ({time}). OK speichert Ihren Plan als neue Datei, und die andere Version bleibt. Abbrechen speichert nicht.",
  "The plan file: new, open, save, and versions":
    "Die Plandatei: neu, öffnen, speichern und Versionen",
  // remote.ts: the copies without the network, and the list of the share links.
  "plan {name}": "Plan {name}",
  "No connection to {server}. You see the copy of this browser from {time}, only to view.":
    "Keine Verbindung zu {server}. Sie sehen die Kopie dieses Browsers von {time}, nur zum Ansehen.",
  "Offline copy": "Offline-Kopie",
  "On a server": "Auf einem Server",
  "No connection to {server}. This is the copy of this browser, revision {revision}, only to view.":
    "Keine Verbindung zu {server}. Das ist die Kopie dieses Browsers, Version {revision}, nur zum Ansehen.",
  "Connect again": "Erneut verbinden",
  "Share links": "Freigabe-Links",
  "Copy from {time}": "Kopie von {time}",

  // ----- src/ui/presence.ts: the people on a plan of a server -----
  Viewing: "Ansehen",
  "You only view the plan. Click to edit it.":
    "Sie sehen den Plan nur an. Klicken Sie, um ihn zu bearbeiten.",
  "You edit the plan. Click to only view it, for example to follow another person.":
    "Sie bearbeiten den Plan. Klicken Sie, um ihn nur anzusehen, zum Beispiel um einer anderen Person zu folgen.",
  "Your name": "Ihr Name",
  "Your name…": "Ihr Name …",
  "You follow {name}": "Sie folgen {name}",
  "Stop following": "Nicht mehr folgen",
  "The server did not take your last change: {error}":
    "Der Server hat Ihre letzte Änderung nicht übernommen: {error}",
  "{name} closed the plan.": "{name} hat den Plan geschlossen.",
  views: "sieht an",
  edits: "bearbeitet",
  "{name} ({what}, {story}). Click to follow.": "{name} ({what}, {story}). Klicken, um zu folgen.",
  "{name} ({what}, {story}). Click to stop following.":
    "{name} ({what}, {story}). Klicken, um nicht mehr zu folgen.",
  "You only view this plan. Click Edit at the top to change it.":
    "Sie sehen diesen Plan nur an. Klicken Sie oben auf Bearbeiten, um ihn zu ändern.",
  "You edit this plan with the others who have it open. Each change saves to the server.":
    "Sie bearbeiten diesen Plan gemeinsam mit den anderen, die ihn geöffnet haben. Jede Änderung wird auf dem Server gespeichert.",
  "You only view this plan. Click Edit to change it.":
    "Sie sehen diesen Plan nur an. Klicken Sie auf Bearbeiten, um ihn zu ändern.",
  // remote.ts: the accounts, and the errors of the server.
  "{used} of {limit}": "{used} von {limit}",
  "{count} of {limit} plans": "{count} von {limit} Plänen",
  "{count} plans": "{count} Pläne",
  invites: "lädt ein",
  "only shared plans": "nur geteilte Pläne",
  "The server has another version of the API ({server}; the app knows {app}). Load the page again.":
    "Der Server hat eine andere API-Version ({server}; die App kennt {app}). Laden Sie die Seite neu.",
  "You can only view this plan now. Save a copy to keep your changes.":
    "Sie können diesen Plan jetzt nur ansehen. Speichern Sie eine Kopie, um Ihre Änderungen zu behalten.",
  copy: "Kopie",
  "1 year": "1 Jahr",
  Copy: "Kopieren",
  Password: "Passwort",
  "Password again": "Passwort wiederholen",
  "An account needs a name.": "Ein Konto braucht einen Namen.",
  "The password needs at least 8 characters.": "Das Passwort braucht mindestens 8 Zeichen.",
  "The two passwords are not the same.": "Die zwei Passwörter sind nicht gleich.",
  "Log in to {server}": "Bei {server} anmelden",
  "No account? Ask the admin of the server for an invite link.":
    "Kein Konto? Fragen Sie den Admin des Servers nach einem Einladungslink.",
  "Log in": "Anmelden",
  "Logged in as {name}.": "Angemeldet als {name}.",
  "Set up {server}": "{server} einrichten",
  "A new password": "Ein neues Passwort",
  "Your account on {server}": "Ihr Konto auf {server}",
  "This is the first account of the server: the admin. The admin invites the others.":
    "Das ist das erste Konto des Servers: der Admin. Der Admin lädt die anderen ein.",
  "Choose a new password for {name}. The other logins of the account end.":
    "Wählen Sie ein neues Passwort für {name}. Die anderen Anmeldungen des Kontos enden.",
  "Choose a name and a password. The link works only once.":
    "Wählen Sie einen Namen und ein Passwort. Der Link funktioniert nur einmal.",
  "Save the password": "Passwort speichern",
  "Make the account": "Konto anlegen",
  "On {server}: {usage}.": "Auf {server}: {usage}.",
  "Change the password": "Passwort ändern",
  "Old password": "Altes Passwort",
  "New password": "Neues Passwort",
  "The password is changed. The other logins of the account ended.":
    "Das Passwort ist geändert. Die anderen Anmeldungen des Kontos sind beendet.",
  "Log out": "Abmelden",
  "Logged out.": "Abgemeldet.",
  "You can only view this plan.": "Sie können diesen Plan nur ansehen.",
  For: "Für",
  "Sees and edits all plans": "Sieht und bearbeitet alle Pläne",
  "Can invite others": "Kann andere einladen",
  "Server and accounts": "Server und Konten",
  "Invite others": "Andere einladen",
  "no limit": "unbegrenzt",
  Accounts: "Konten",
  admin: "Admin",
  Admin: "Admin",
  "The link for a new password of {name}, shown only now:":
    "Der Link für ein neues Passwort von {name}, nur jetzt sichtbar:",
  "Remove the account {name}? Its plans become yours.":
    "Das Konto {name} entfernen? Seine Pläne gehören dann Ihnen.",
  Invite: "Einladung",
  "An invite link is for one person. It works once, and ends after some days. The person chooses a name and a password.":
    "Ein Einladungslink ist für eine Person. Er funktioniert einmal und endet nach einigen Tagen. Die Person wählt einen Namen und ein Passwort.",
  "Make an invite link": "Einladungslink erstellen",
  "The invite link, shown only now. Copy it and send it on a safe way:":
    "Der Einladungslink, nur jetzt sichtbar. Kopieren Sie ihn und schicken Sie ihn auf sicherem Weg:",
  "Open links": "Offene Links",
  "New password for {name}": "Neues Passwort für {name}",
  "Remove the link": "Link entfernen",
  default: "Standard",
  "Most plans": "Höchstens Pläne",
  "Empty is the default of the server, 0 is no limit.":
    "Leer ist der Standard des Servers, 0 ist unbegrenzt.",
  '"{name}" to {server}': "„{name}“ auf {server}",
  "On the server, each change saves to the server, and you can share the plan with links.":
    "Auf dem Server wird jede Änderung dort gespeichert, und Sie können den Plan mit Links teilen.",
  "Not logged in": "Nicht angemeldet",
  "No connection": "Keine Verbindung",
  "Your account": "Ihr Konto",
  "Log in to see your plans on this server.":
    "Melden Sie sich an, um Ihre Pläne auf diesem Server zu sehen.",
  "The password is too long.": "Das Passwort ist zu lang.",
  "The name is too long.": "Der Name ist zu lang.",
  "This name is taken.": "Dieser Name ist vergeben.",
  "Log in first.": "Melden Sie sich zuerst an.",
  "The old password is wrong.": "Das alte Passwort ist falsch.",
  "The account does not exist.": "Das Konto gibt es nicht.",
  "You cannot remove your own account.": "Sie können Ihr eigenes Konto nicht entfernen.",
  "Only the admin can do this.": "Das kann nur der Admin.",
  "This account cannot invite.": "Dieses Konto kann nicht einladen.",
  "The link does not exist.": "Den Link gibt es nicht.",
  "The link is not valid. It can be used or too old.":
    "Der Link ist nicht gültig. Er kann schon verwendet oder zu alt sein.",
  "You cannot share this plan.": "Sie können diesen Plan nicht teilen.",
  "A link needs a label.": "Ein Link braucht eine Bezeichnung.",
  "The end date is in the past.": "Das Enddatum liegt in der Vergangenheit.",
  "This account cannot make plans.": "Dieses Konto kann keine Pläne anlegen.",
  "This account has the most plans that it may have.":
    "Dieses Konto hat schon so viele Pläne, wie es haben darf.",
  "The plan has a newer revision. Load it first.":
    "Der Plan hat eine neuere Version. Laden Sie sie zuerst.",
  "The space of the owner of the plan is full.": "Der Speicher des Besitzers des Plans ist voll.",
  "The revision does not exist.": "Die Version gibt es nicht.",
  "Only the owner or the admin can delete the plan.":
    "Nur der Besitzer oder der Admin kann den Plan löschen.",
  "Too many tries. Wait a few minutes.": "Zu viele Versuche. Warten Sie ein paar Minuten.",
  "The request comes from another site.": "Die Anfrage kommt von einer anderen Seite.",
  "The name or the password is wrong.": "Der Name oder das Passwort ist falsch.",
  "The plan does not exist.": "Den Plan gibt es nicht.",
  "The changes do not fit the plan.": "Die Änderungen passen nicht zum Plan.",
  "The plan is too large for this server.": "Der Plan ist zu groß für diesen Server.",
  "The server does not answer. Check the network.":
    "Der Server antwortet nicht. Prüfen Sie das Netzwerk.",
  "This is not a Grundriss server.": "Das ist kein Grundriss-Server.",
  // remote.ts: the changes without the network.
  "The browser cannot keep your changes. Save a copy to a file.":
    "Der Browser kann Ihre Änderungen nicht behalten. Speichern Sie eine Kopie in eine Datei.",
  "Your changes without the network go to the server now.":
    "Ihre Änderungen ohne Netzwerk gehen jetzt an den Server.",
  "You can only view this plan now. Your changes without the network stay in this browser: save a copy to keep them.":
    "Sie können diesen Plan jetzt nur ansehen. Ihre Änderungen ohne Netzwerk bleiben in diesem Browser: Speichern Sie eine Kopie, um sie zu behalten.",
  "No connection to {server}. You edit the copy of this browser from {time}. The changes go to the server when it answers again.":
    "Keine Verbindung zu {server}. Sie bearbeiten die Kopie dieses Browsers von {time}. Die Änderungen gehen an den Server, sobald er wieder antwortet.",
  "The server does not give this plan any more. Save a copy to keep your changes.":
    "Der Server gibt diesen Plan nicht mehr heraus. Speichern Sie eine Kopie, um Ihre Änderungen zu behalten.",
  "The server answers again. Your changes go to it now.":
    "Der Server antwortet wieder. Ihre Änderungen gehen jetzt an ihn.",
  "The server answers again.": "Der Server antwortet wieder.",
  "Offline · changes wait": "Offline · Änderungen warten",
  Offline: "Offline",
  "Not sent · kept in the browser": "Nicht gesendet · im Browser behalten",
  "No connection to {server}. You edit the copy of this browser, revision {revision}. The browser keeps your changes, and they go to the server when it answers again.":
    "Keine Verbindung zu {server}. Sie bearbeiten die Kopie dieses Browsers, Version {revision}. Der Browser behält Ihre Änderungen, und sie gehen an den Server, sobald er wieder antwortet.",
  "The server does not answer yet. The app tries again by itself.":
    "Der Server antwortet noch nicht. Die App versucht es von selbst wieder.",
  "Changes wait": "Änderungen warten",
  "Your changes without the network go to the server when you open the plan.":
    "Ihre Änderungen ohne Netzwerk gehen an den Server, wenn Sie den Plan öffnen.",
  current: "aktuell",
  "Some changes did not go to the server yet. Log out and discard them?":
    "Einige Änderungen sind noch nicht auf dem Server. Abmelden und sie verwerfen?",
  "Draw a house or trace a scan, see it in 3D, and check its energy and a renovation. Your plans are on {server} and save themselves after each change.":
    "Zeichnen Sie ein Haus oder zeichnen Sie einen Scan nach, sehen Sie es in 3D, und prüfen Sie seine Energie und eine Sanierung. Ihre Pläne sind auf {server} und speichern sich nach jeder Änderung selbst.",
  "Plans only in this browser: {count}. Move them to {server}…":
    "Pläne nur in diesem Browser: {count}. Auf {server} verschieben…",
  "Plans in this browser": "Pläne in diesem Browser",
  "These plans are not on {server}. Move each one to the server to keep it there.":
    "Diese Pläne sind nicht auf {server}. Verschieben Sie jeden auf den Server, um ihn dort zu behalten.",
  "Your account cannot make plans on this server.":
    "Ihr Konto kann auf diesem Server keine Pläne anlegen.",
  "Your account and the server: {name} on {server}":
    "Ihr Konto und der Server: {name} auf {server}",
  "Your account on {server}.": "Ihr Konto auf {server}.",
  Space: "Speicher",
  Plans: "Pläne",
  Rights: "Rechte",
  "{count} of {limit}": "{count} von {limit}",
  Version: "Version",
  "{plans} plans, {accounts} accounts, {shares} share links":
    "{plans} Pläne, {accounts} Konten, {shares} Freigabe-Links",
  "A new account": "Ein neues Konto",
  "{quota} for at most {count} plans": "{quota} für höchstens {count} Pläne",
  "A link for one use": "Einmal-Link",
  "{hours} hours": "{hours} Stunden",
  "Link for a new password": "Link für ein neues Passwort",
  "Remove the account": "Konto entfernen",
  "Save a copy": "Eine Kopie speichern",
  Server: "Server",
  "Plans on {server}": "Pläne auf {server}",
};
