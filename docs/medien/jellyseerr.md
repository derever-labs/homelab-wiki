---
title: Seerr (Jellyseerr)
description: Media Request Management für Jellyfin mit Sonarr/Radarr-Integration
tags:
  - service
  - media
  - nomad
---

# Seerr (Jellyseerr)

Seerr (bis Version 2.x unter dem Namen Jellyseerr, seit 3.0 umbenannt zu `seerr-team/seerr`) ist die User-facing Oberfläche für Medienwünsche. Familie und Gäste können darüber Filme und Serien anfordern, ohne direkt mit Sonarr oder Radarr zu arbeiten.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [wish.ackermannprivat.ch](https://wish.ackermannprivat.ch) |
| Deployment | Nomad Job `media/jellyseerr.nomad` |
| Image | `ghcr.io/seerr-team/seerr` via ZOT (`ghcr.io`-Pfad-Präfix) |
| Storage | Linstor CSI Volume `jellyseerr-data` |
| Auth | `public-auth@file` |

::: warning Seerr 3.x läuft non-root
Seit 3.0 läuft der Container als User UID 1000 (PUID/PGID werden ignoriert, der Job setzt `init = true`). Das Config-Volume muss `1000:1000` gehören -- läuft zwischenzeitlich eine 2.x-Version (root), legen deren Log-Dateien den 3.x-Start mit einem EACCES-Crash-Loop lahm.
:::

::: warning pgloader-konvertierte Datenbank
Die PostgreSQL-Datenbank `jellyseerr` wurde historisch per pgloader aus SQLite konvertiert. Constraint-/Index-Namen und Spaltentypen (bigint statt integer) weichen vom TypeORM-Schema ab -- vor Major-Upgrades die Migrations-Dateien im neuen Image gegen das Ist-Schema prüfen, sonst bricht die automatische DB-Migration.
:::

## Rolle im Stack

Seerr leitet Anfragen automatisch an die zuständigen Arr-Services weiter, die den Download und die Organisation übernehmen. Das System hat zwei Ebenen: den synchronen Wunsch-Pfad und den asynchronen Retry-Weg des [request-sync Sidecars](#request-sync-sidecar), der hängen gebliebene Aufträge nachholt.

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten sind synchron (der Initiator wartet auf die Antwort), gestrichelte asynchron -- zeitgesteuert statt requestgetrieben. Farben kodieren die Wege: Blau der synchrone Wunsch-Pfad (Schritte 1-3), Ocker der Retry-Weg des Sidecars (S1-S2), Grau der dauernde Zustands-Verkehr ohne Schrittnummer. Der Retry mündet in denselben Anlage-Schritt wie der Wunsch-Pfad, darum trägt die Kante zu Sonarr und Radarr beide Nummern (3. / S3.).

**Leitfrage:** Wie wird aus einem Wunsch ein Auftrag an Sonarr oder Radarr -- und wer holt den Auftrag nach, wenn die Übermittlung scheitert?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  grp: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  wunsch: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  retry: { style: { stroke: "#8f6418"; font-color: "#8f6418"; stroke-dash: 3 } }
  neben: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

direction: right

user: "Familie und Gäste\n(wish.ackermannprivat.ch)" { class: svc }

alloc: Nomad-Job jellyseerr {
  class: grp
  tooltip: eine Allokation im Host-Netzwerk auf client-05/06 -- ein Prestart-Task wartet vor dem Start auf PostgreSQL
  seerr: "Seerr\n(Haupttask)" { class: svc }
  rsync: "request-sync\n(Sidecar-Task)" {
    class: svc
    tooltip: Python-Loop im selben Job -- wartet beim Start bis die Seerr-API antwortet
  }
}

jf: Jellyfin { class: svc }
arr: Sonarr und Radarr { class: svc }
pg: "PostgreSQL\n(Datenbank jellyseerr)" {
  class: data
  tooltip: Shared Cluster über Consul DNS -- postgres.service.consul
}

user -> alloc.seerr: "1. Wunsch (HTTPS)" { class: wunsch }
alloc.seerr -> jf: "2. prüft Verfügbarkeit (API)" { class: wunsch }
alloc.seerr -> arr: "3. / S3. legt genehmigten\nRequest an (API)" { class: wunsch }
alloc.seerr -> pg: "hält Requests und\nMedienstatus (SQL)" { class: neben }
alloc.rsync -> pg: "S1. liest hängen gebliebene\nRequests (SQL, nur lesend)" { class: retry }
alloc.rsync -> alloc.seerr: "S2. stösst Retry an\n(API auf localhost)" { class: retry }
```

**Lesehilfe:**

1. Familie und Gäste stellen den Wunsch über `wish.ackermannprivat.ch` -- davor sitzt Authentik ForwardAuth mit der [öffentlichen Auth-Chain](#konfiguration).
2. Seerr prüft über die Jellyfin-API, ob der Titel schon in der Mediathek ist (alle Adressen intern via Consul DNS: [Service-Verbindungen](#service-verbindungen)).
3. Genehmigte Requests legt Seerr per API in Sonarr (Serien) oder Radarr (Filme) an -- mit seinen eigenen Qualitätsprofilen, Tags und Root-Foldern.
4. Requests und Medienstatus hält Seerr in der [PostgreSQL-Datenbank](#datenbank) -- das ist der Zustand, den der Sidecar später abfragt (grau, kein Schritt der Wunsch-Kette).
5. S1: Der Sidecar liest periodisch direkt aus der Datenbank, welche genehmigten Requests hängen geblieben sind ([Auswahlkriterien](#request-sync-sidecar)).
6. S2: Für jeden Treffer ruft er die Seerr-API auf localhost auf -- beide Tasks laufen in derselben Nomad-Allokation im Host-Netz.
7. S3: Seerr legt den Titel mit seiner eigenen Logik über denselben Kanal wie in Schritt 3 nach -- deshalb schreibt der Sidecar nie direkt in Sonarr oder Radarr.

Der weitere Weg vom angelegten Request bis zum abspielbaren Titel (Prowlarr-Suche, SABnzbd-Download, Hardlink-Import, Jellyfin-Scan) gehört nicht mehr zu Seerr -- er ist im [Wunsch-Pfad des Medien-Kapitels](./index.md#wunsch-pfad-vom-request-zum-abspielbaren-titel) gezeichnet.

## Konfiguration

### Datenbank

Seerr nutzt die Datenbank `jellyseerr` der shared PostgreSQL-Instanz über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf die Verfügbarkeit von PostgreSQL bevor der Hauptcontainer startet. Details zur Cluster-Zuordnung: [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md).

### Netzwerk

Seerr läuft im Host-Netzwerkmodus mit statischem Port `5055`. Das ist notwendig für die direkte Kommunikation mit den Arr-Services.

### Constraint

Der Job ist auf `vm-nomad-client-05/06` eingeschränkt (Constraint), mit Affinität für `client-05` (Nähe zum PostgreSQL).

::: warning Öffentliche Auth-Chain
Seerr nutzt `public-auth` statt der internen Auth-Chain. Das ermöglicht Familienmitgliedern und Gästen den Zugriff über Authentik ForwardAuth ohne interne Netzwerkzugehörigkeit.
:::

Passwort-Recovery: Authentik-Login erscheint via ForwardAuth bereits vor Seerr und enthält den nativen Recovery-Link. Zusätzlich rendert Seerr auf der "Sign in with Jellyfin"-Maske einen Forgot-Link auf den Authentik-Recovery-Flow -- aktiviert via Settings → Jellyfin: External URL (`externalHostname`) **plus** Forgot Password URL (`jellyfinForgotPasswordUrl`). Beide URLs ohne trailing slash. Native OIDC fehlt auch in Seerr 3.x. Details: [Authentik Recovery -- Recovery-Eingangspfade aus Apps](../edge/authentik/recovery.md#recovery-eingangspfade-aus-apps).

## Request Sync Sidecar

Seerr hat keinen eingebauten Retry-Mechanismus: Wenn ein approved Request nicht an Sonarr/Radarr übermittelt werden kann (z.B. Service kurzzeitig nicht erreichbar), bleibt der Request im Status "Processing" hängen und wird nie wiederholt.

Der Sidecar-Task `request-sync` läuft als zweiter Task in derselben Nomad-Allokation wie Seerr (Job `media/jellyseerr.nomad`, Script `media/scripts/jellyseerr-request-sync.py` im nomad-jobs-Repo) und schliesst diese Lücke zeitgesteuert:

- **Auswahl:** Er liest periodisch (Default alle 6 Stunden, Intervall und Alterslimite als Env-Variablen im Job) direkt aus der Seerr-Datenbank alle genehmigten Requests, deren Medium noch im Status Pending oder Processing steht.
- **Alterslimite:** Requests über der Alterslimite (Default 7 Tage) fasst er bewusst nicht mehr an -- solche Titel sind mit hoher Wahrscheinlichkeit schlicht nicht verfügbar, und jeder weitere Retry würde erneut Notifications auslösen.
- **Retry über Seerr, nie direkt:** Für jeden Treffer ruft er den Seerr-Endpoint `/api/v1/request/{id}/retry` auf localhost auf. Die Datenbank liest der Sidecar nur -- angelegt wird ausschliesslich über Seerr selbst, damit dessen eigene Logik für Qualitätsprofile, Tags und Root-Folder greift. Seerr entscheidet dabei selbst, ob der Titel in Sonarr/Radarr neu angelegt oder nur der Status aktualisiert wird.

## Service-Verbindungen

Seerr verbindet sich intern über Consul DNS zu allen Diensten:

| Service | Adresse |
| :--- | :--- |
| Sonarr | `sonarr.service.consul:8989` |
| Radarr | `radarr.service.consul:7878` |
| Jellyfin | `jellyfin.service.consul:8096` |
| PostgreSQL | `postgres.service.consul:5432` |

::: warning Keine externen URLs verwenden
Seerr darf nicht über externe URLs (`*.ackermannprivat.ch`) mit Sonarr/Radarr/Jellyfin kommunizieren. Die Verbindung über Traefik ist aus dem Cluster heraus unzuverlässig und führt zu stillen Sync-Ausfällen.
:::

## Ausfallverhalten

- **Was, wenn Sonarr oder Radarr beim Genehmigen down ist?** Die Übermittlung scheitert, der Request bleibt genehmigt und das Medium steht weiter auf Pending oder Processing -- Seerr selbst wiederholt nie. Genau dafür existiert der [request-sync Sidecar](#request-sync-sidecar): Beim nächsten Lauf findet er den Request in der Datenbank und stösst den Retry an, sobald das Ziel wieder erreichbar ist. Nur Requests über der Alterslimite bleiben liegen.

- **Was, wenn PostgreSQL down ist?** Seerr steht -- beim Deployment hält ein Prestart-Task den Start zurück, bis die [Datenbank](#datenbank) erreichbar ist. Auch der Sidecar-Lauf schlägt dann fehl; ein einzelner Fehl-Lauf beendet den Sidecar nicht, er versucht es im nächsten Intervall erneut.

- **Was, wenn Jellyfin down ist?** Seerr kann die Verfügbarkeit von Titeln nicht mehr prüfen -- die Stack-Sicht dazu steht im [Ausfallverhalten des Medien-Kapitels](./index.md#ausfallverhalten).

- **Was, wenn der Sidecar-Task stirbt?** Der Wunsch-Pfad ist nicht betroffen, es entfällt nur die Nachholung. Hängen gebliebene Requests warten bis zum nächsten erfolgreichen Lauf; überschreiten sie dabei die Alterslimite, fasst der Sidecar sie nicht mehr an.

## Verwandte Seiten

- [Arr Stack](./arr-stack/index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Jellyfin](./jellyfin/index.md) -- Medienserver, dessen Verfügbarkeit Seerr abfragt
- [SuggestArr](./suggestarr/index.md) -- Erstellt automatisch Pending Requests in Seerr
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware Chains für Authentifizierung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
