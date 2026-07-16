---
title: ntfy
description: Selbstgehosteter Push-Benachrichtigungsdienst mit Action-Buttons für Homelab-Services
tags:
  - ntfy
  - notifications
  - infrastructure
  - nomad
---

# ntfy

ntfy ist ein selbstgehosteter Push-Benachrichtigungsdienst. Homelab-Services publizieren Nachrichten auf Topics, die als Push auf die ntfy-App (auch iOS) zugestellt werden -- mit optionalen Action-Buttons für Rückfragen. Erster Konsument ist [Todo Ingest](../todo-ingest/index.md); der Dienst ist generisch für weitere Push-Anwendungen nutzbar.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [ntfy.ackermannprivat.ch](https://ntfy.ackermannprivat.ch) (öffentlich via Traefik) |
| Deployment | Nomad Job `infrastructure/ntfy.nomad` |
| Storage | Linstor CSI: `ntfy-data` (Benutzer- und Cache-Datenbank) |
| Auth | ntfy-eigen, `deny-all` (kein anonymer Zugriff); extern `public-noauth@file`, intern `intern-noauth@file` |
| Secrets | 1Password (Admin-Passwort, Service-Token); Service-Token zusätzlich in Vault `kv/todo-ingest` |

## Rolle im Stack

ntfy ist der generische Push-Transport des Homelabs. Ein Dienst publiziert eine Nachricht auf ein Topic, ntfy stellt sie an die abonnierten Clients zu. Für den ersten Konsumenten Todo Ingest transportiert ntfy zwei Arten von Nachrichten: Bestätigungen und Fehlermeldungen sowie interaktive Rückfragen mit HSLU/Privat-Action-Buttons, deren Klick direkt einen HTTP-Callback auslöst.

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

Producers: Publisher {
  class: container
  TI: "todo-ingest\n(Topic todo, write-only)" { class: node }
}

Ntfy: "ntfy\n(deny-all, self-hosted)" { class: node }
Upstream: "ntfy.sh\n(nur Nachrichten-ID)" { class: node }
Apple: "Apple Push (APNS)" { class: node }
App: "ntfy iOS-App" { class: node }

Producers.TI -> Ntfy: "publish"
Ntfy -> Upstream: "Weckruf-Anstoss"
Upstream -> Apple
Apple -> App: "Weckruf"
App -> Ntfy: "Inhalt abrufen"
```

::: info iOS-Push läuft über die ntfy.sh-Instanz
Für iOS-Zustellung ist `NTFY_UPSTREAM_BASE_URL` auf `https://ntfy.sh` gesetzt. Apple-Push (APNS) ist an ein festes App-Zertifikat gebunden, das nur die offizielle ntfy.sh-Instanz besitzt. Deshalb schickt die selbstgehostete Instanz nur einen Weckruf mit der Nachrichten-ID über ntfy.sh an APNS; den eigentlichen Inhalt holt die App anschliessend direkt von der selbstgehosteten Instanz. Ohne diesen Upstream kämen Pushes auf iOS um Stunden verzögert an.
:::

## Authentifizierung und Zugriff

Der Zugriff ist auf `deny-all` gestellt: Ohne Benutzer oder Token ist weder Lesen noch Schreiben möglich. Zwei Rollen sind angelegt:

- **`samuel`** -- Admin-Benutzer für die App und die Verwaltung. Das Passwort liegt in 1Password (`ntfy Homelab Admin Password`).
- **`todo-ingest`** -- Service-Benutzer mit reiner Schreibberechtigung auf das Topic `todo`. Der Token liegt in 1Password (`ntfy todo-ingest Token`) und in Vault `kv/todo-ingest`.

Der externe Router nutzt `public-noauth@file` (CrowdSec plus Security-Header); die eigentliche Zugriffskontrolle macht ntfy selbst. Ein interner Router (`intern-noauth@file`) deckt den Zugriff aus den internen Netzen ab, und `/v1/health` läuft über einen eigenen, hoch priorisierten no-auth-Router. Details zu den Ketten: [Traefik Referenz](../edge/traefik/referenz.md).

## Verwandte Seiten

- [Todo Ingest](../todo-ingest/index.md) -- erster Konsument, nutzt Topic `todo` für Bestätigungen und Rückfragen
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware-Ketten `public-noauth@file` und `intern-noauth@file`
- [Linstor CSI](../linstor-storage/index.md) -- replizierter Block-Storage (DRBD) für die Datenbanken
- [Credentials](../_referenz/credentials.md) -- Speicherorte der Zugangsdaten
