---
title: Finanzen-Website
description: Familien-Dokumentenportal zum MFH-Projekt mit PDF-Reader, Kommentaren und einem Frage-Assistenten auf dem Claude-Abo
tags:
  - service
  - nomad
  - authentik
  - familie
  - dokumente
---

# Finanzen-Website

Die Finanzen-Website ist das Dokumentenportal der Familie zum Mehrfamilienhaus-Projekt Tieffurtstrasse 2 in Dottikon. Sie zeigt die fünf Projektdokumente in einem PDF-Reader, lässt die Familie direkt an der Textstelle kommentieren und beantwortet Fragen zum Inhalt über einen Assistenten, der auf dem Claude-Abo läuft. Der Dienst ist produktiv und wird von der Familie genutzt.

Publikations-Ablauf, Gotchas und Troubleshooting stehen in [Finanzen-Website Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [finanzen.ackermannprivat.ch](https://finanzen.ackermannprivat.ch) (nur aus internen Netzen und Tailscale) |
| Deployment | Nomad Job `services/finanzen.nomad`, Images von Hand aus dem Gitea-Repo `finanzen` gebaut |
| Storage | Linstor CSI `finanzen-data` (SQLite mit den Kommentaren); die PDFs liegen im Image |
| Auth | `intern-auth@file` plus Authentik-Application `finanzen` mit Einzel-User-Bindings |
| Secrets | Vault `kv/finanzen` (OAuth-Token des Claude-Abos für den Frage-Bereich) |

## Rolle im Stack

Der Dienst ist die Lese- und Rückmelde-Oberfläche für ein Projekt, dessen Inhalte ausserhalb des Homelabs entstehen: Python-Generatoren im Gitea-Repo `finanzen` erzeugen die banktauglichen PDF- und Excel-Dokumente, das Homelab stellt sie der Familie zugänglich und sammelt die Rückmeldungen ein. Damit ist die Website bewusst kein Dokumenten-Management -- sie zeigt genau einen kuratierten Stand und macht ihn besprechbar.

Die Dokumente sind hoch sensibel (Bankdossier, Familienstruktur, Anlagestrategien). Alle tragenden Entwurfsentscheide folgen deshalb derselben Linie: Die Grenze zwischen "darf sehen" und "darf nicht sehen" wird immer serverseitig gezogen, nie allein in der Oberfläche.

```d2
classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

direction: right

Browser: "Browser der Familie\n(internes Netz oder Tailscale)" {
  class: node
}

Edge: "Edge" {
  style.stroke-dash: 4

  TR: "Traefik\nRouter finanzen-internal" {
    class: node
    tooltip: "Nur ein interner Router mit ClientIP-Matcher -- ein oeffentlicher Router existiert bewusst nicht"
  }

  AK: "Authentik\nApplication finanzen" {
    class: node
    tooltip: "Einzel-User-Bindings statt Gruppen-Binding; die Anmeldung matcht ausschliesslich die E-Mail-Adresse"
  }
}

Job: "Nomad-Gruppe finanzen" {
  style.stroke-dash: 4

  WEB: "web (nginx)\nSeite plus PDFs plus Guard" {
    class: node
    tooltip: "Einziger Task mit Host-Port; sperrt die Anlagestrategie Samuel serverseitig auf den Benutzernamen"
  }

  API: "api (FastAPI)\nKommentare und Frage-Bereich" {
    class: node
    tooltip: "Bewusst ohne Host-Port -- erreichbar nur ueber den nginx im geteilten Bridge-Namespace"
  }

  CLI: "claude-CLI\nheadless im api-Image" {
    class: node
    tooltip: "Ohne Werkzeuge gestartet; laeuft in einem eigenen Arbeitsverzeichnis ohne Skills und ohne MCP-Server"
  }
}

DB: "SQLite comments.db\nauf CSI finanzen-data" {
  shape: cylinder
  class: node
}

VA: "Vault kv/finanzen" {
  class: node
}

AN: "Anthropic\nClaude-Abo" {
  class: node
}

Browser -> Edge.TR: "1. HTTPS auf finanzen.ackermannprivat.ch" { style.stroke: "#2563eb" }
Edge.TR -> Edge.AK: "2. ForwardAuth -- ohne Sitzung 302 auf den Login" { style.stroke: "#2563eb" }
Edge.TR -> Job.WEB: "3. Anfrage samt X-authentik-Kopfzeilen" { style.stroke: "#2563eb" }
Job.WEB -> Job.API: "4. Pfad /api/ auf 127.0.0.1:8080" { style.stroke: "#2563eb" }
Job.API -> DB: "5. Kommentare lesen und schreiben" { style.stroke: "#16a34a" }
Job.API -> Job.CLI: "6. Frage plus Systemtext des Zuschnitts ueber stdin" { style.stroke: "#7c3aed" }
Job.CLI -> AN: "7. Antwort als Stream auf dem Abo-Token" { style.stroke: "#7c3aed" }
Job.API -> VA: "Abo-Token beim Start des Tasks" { style.stroke-dash: 4 }
```

Leitfrage des Diagramms: Wie kommt eine Anfrage der Familie durch die Auth-Kette bis zu Dokument, Kommentar und Antwort -- und an welcher Stelle entscheidet sich, wer welches Dokument zu sehen bekommt?

1. Der Aufruf erreicht Traefik nur aus den internen Netzen oder über Tailscale; von aussen greift kein Router (siehe [Exposition](#exposition-und-zugriff)).
2. Traefik fragt die Authentik-ForwardAuth-Kette; ohne gültige Sitzung endet der Aufruf als 302 auf den Login.
3. Erst danach erreicht die Anfrage den nginx, angereichert um die Identitäts-Kopfzeilen von Authentik.
4. Statische Seite und PDFs liefert der nginx selbst, alles unter `/api/` reicht er an den API-Task weiter (siehe [Zwei Tasks, ein Host-Port](#zwei-tasks-ein-host-port)).
5. Kommentare liegen in einer SQLite-Datei auf dem replizierten CSI-Volume und überleben damit jeden Neustart und jeden Node-Wechsel.
6. Für eine Frage baut der API-Task den Systemtext nach dem Zuschnitt der fragenden Person und übergibt ihn dem claude-CLI (siehe [Der Frage-Bereich](#der-frage-bereich)).
7. Das CLI spricht Anthropic mit dem Abo-Token aus Vault an und streamt die Antwort zurück bis in die Oberfläche.

**Belegt gegen** `nomad-jobs/services/finanzen.nomad`, `website/README.md` und `website-api/README.md` im Gitea-Repo `finanzen` sowie die Live-Antwort von finanzen.ackermannprivat.ch, Stand 10.08.2026.

## Zwei Tasks, ein Host-Port

Web- und API-Container laufen als zwei Tasks in **einer** Nomad-Gruppe und teilen sich damit den Bridge-Netzwerk-Namespace. Nur der nginx hat einen Host-Port; der API-Task hat bewusst keinen und ist ausschliesslich über `127.0.0.1:8080` aus dem nginx erreichbar.

Der Grund ist die Identität: Die API hat keine eigene Auth-Logik, sie vertraut den Kopfzeilen `X-authentik-username` und `X-authentik-name`. Hinge sie mit einem Host-Port am Node, könnte jemand im LAN diese Kopfzeilen selbst setzen und wäre gegenüber der API eine beliebige Person. Der fehlende Host-Port ist damit kein Sparen, sondern die tragende Sicherheitsannahme des Dienstes.

Ein Prestart-Task setzt vor dem Start die Rechte auf dem CSI-Volume, weil Linstor es als `root` einhängt, der API-Dienst aber als unprivilegierter Benutzer läuft und die SQLite-Datei sonst nicht anlegen könnte.

## Exposition und Zugriff

Die Seite hat **nur** einen internen Router mit ClientIP-Matcher auf die privaten Netze und den Tailscale-Bereich, dazu die Authentik-Kette `intern-auth@file`. Ein öffentlicher Router wurde bewusst nie angelegt: Für einen Dokumentenbestand dieser Vertraulichkeit ist der Verzicht auf die Erreichbarkeit von aussen die billigste wirksame Massnahme, solange niemand von unterwegs ohne Tailscale darauf zugreifen muss. Details zu den Ketten: [Traefik Referenz](../../edge/traefik/referenz.md).

::: info Einzel-User-Bindings statt Familien-Gruppe
Die Authentik-Application `finanzen` bindet jedes Familienmitglied **einzeln** statt über die Gruppe `family`. Der Grund ist kein Vorbehalt gegen Gruppen, sondern deren Inhalt: In `family` steckt auch ein Dienstkonto (der LDAP-Benutzer von Jellyfin), und ein Testkonto wäre mit jedem künftigen Gruppenzugang automatisch mitgewachsen. Der Preis dieses Entscheids ist bekannt und akzeptiert -- ein neues Familienmitglied braucht ein eigenes Binding von Hand.
:::

::: warning Anmeldung nur mit der E-Mail-Adresse
Die Identifikations-Stufe in Authentik matcht ausschliesslich die E-Mail-Adresse, nicht den Benutzernamen. Wer sich mit dem Vornamen anzumelden versucht, kommt auch mit richtigem Passwort nicht durch. Das ist die häufigste Rückfrage aus der Familie.
:::

### Der Guard für das Einzel-Dokument

Ein Dokument -- die Anlagestrategie von Samuel -- ist nur für ihn bestimmt. Der Schutz liegt auf zwei Ebenen, und nur die zweite trägt wirklich:

- Die Oberfläche filtert anhand des Manifest-Feldes `sichtbarkeit` und der Antwort von `/api/me`. Ohne erreichbares Backend bleiben geschützte Dokumente versteckt, nicht sichtbar -- die sichere Voreinstellung.
- Der nginx sperrt die PDF-Datei und ihre Miniatur zusätzlich serverseitig auf den Benutzernamen aus der Authentik-Kopfzeile und antwortet sonst mit 403.

Ohne die zweite Ebene wäre die Datei über ihre Direkt-URL für jedes angemeldete Familienmitglied abrufbar gewesen -- eine Filterung in der Oberfläche verbirgt einen Link, sie schützt keine Datei.

## Der Frage-Bereich

Der Assistent beantwortet Fragen zum Inhalt der Dokumente. Er läuft über das claude-CLI, das als Binärdatei im API-Image liegt und headless als Unterprozess aufgerufen wird; authentifiziert wird über einen OAuth-Token des Abos aus Vault. Der Entscheid für das Abo statt eines API-Schlüssels kostet rund 300 MB Image und dimensioniert den Speicher des Tasks -- dafür läuft der Dienst gegen ein bezahltes Kontingent statt gegen Credits. Dasselbe Muster nutzt [Todo Ingest](../todo-ingest/index.md).

Der Dokument-Kontext wird beim Start in den Speicher gelesen und je Zuschnitt zu einem eigenen Systemtext gebaut: einer für die Familie, je einer für Personen mit Sonderrechten. Daraus entstehen getrennte, byte-stabile Cache-Präfixe -- der meistgenutzte Zuschnitt trifft damit zuverlässig den Cache. Gefiltert wird nicht nur der Dokumenttext, sondern auch die Liste der verlinkbaren Dokument-IDs: Sonst verriete schon die Liste die Existenz eines Dokuments, das die fragende Person nicht öffnen darf. Eine unbekannte Identität fällt immer auf den Familien-Zuschnitt zurück, nie auf den weitesten.

::: warning Der Chat kennt nur den gerenderten Zahlenstand
Die Generator-Texte tragen rund 480 Platzhalter, die erst der Dokument-Generator füllt. Ins Image geht deshalb ein aufgelöster Stand, der mitversioniert im Repo liegt. Wer die Konfiguration der Beträge ändert und diesen Stand nicht neu rendert, bekommt einen Assistenten, der mit veralteten Zahlen antwortet -- die Dokumente selbst sind dann bereits neu. Der Ablauf steht in [Finanzen-Website Betrieb](./betrieb.md#publikation-eines-neuen-dokument-stands).
:::

Gegen versehentlichen wie mutwilligen Verbrauch des Abos wirken vier Grenzen: eine Obergrenze je Frage, eine je Verlauf, nur ein CLI-Aufruf gleichzeitig und ein Zeitlimit pro Antwort. Das CLI startet ohne jedes Werkzeug und ohne Skills, Hooks, Plugins oder MCP-Server -- damit bleibt jede Antwort ein einziger Zug und kann nichts im Dateisystem oder im Netz anfassen.

## Abweichung vom App-Standard

Die App lebt im Gitea-Repo `finanzen` neben den Dokumenten-Generatoren und nicht als eigenes Repo in der GitHub-Organisation. Sie hat deshalb keinen CI-Build und keinen automatischen Versions-Bump: Die beiden Images werden von Hand gebaut, per skopeo in die [Zot-Registry](../../plattform/docker-registry/index.md) geschoben und der Job von Hand ausgerollt. Der Entscheid folgt der Publikations-Frequenz -- ein neuer Stand entsteht nur nach einer inhaltlichen Freigabe, nicht bei jedem Commit. Das Muster des [Homelab App-Standards](../../_querschnitt/app-standard/index.md) greift wieder, sobald die Seite über diese Phase hinauswächst.

::: info PDFs im Image statt vom NAS
Die fünf PDFs sind ins Web-Image eingebacken statt über einen NFS-Export der Synology eingehängt. Zwei Gründe: Für hoch vertrauliche Bankdossiers sollte kein neuer NFS-Export auf dem NAS entstehen, und die niedrige Publikations-Frequenz macht den Image-Bau zum bewussten Veröffentlichungs-Akt mit einem versionierten, reproduzierbaren Stand. Der Preis ist ein grösseres Image und ein Deploy pro Dokument-Stand.
:::

## Verwandte Seiten

- [Finanzen-Website Betrieb](./betrieb.md) -- Publikation eines neuen Stands, Kommentar-Datenbank, Gotchas
- [Authentik](../../edge/authentik/index.md) -- SSO und Application-Bindings vor der Seite
- [Traefik Referenz](../../edge/traefik/referenz.md) -- Middleware-Kette `intern-auth@file`
- [Linstor CSI](../../storage/linstor/index.md) -- repliziertes Volume für die Kommentar-Datenbank
- [Vault](../../plattform/vault/index.md) -- Ablage des Abo-Tokens unter `kv/finanzen`
- [Zot Container Registry](../../plattform/docker-registry/index.md) -- Ablage der beiden Images
- [Todo Ingest](../todo-ingest/index.md) -- derselbe Weg über das Claude-Abo im headless CLI
- [Monitoring: Coverage](../../monitoring/coverage/index.md) -- Kuma-Probe und Coverage-Status
