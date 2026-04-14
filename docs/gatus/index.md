---
title: Gatus
description: Oeffentliche Status-Seite und sofort-alarmierendes Monitoring der Kern-Infrastruktur
tags:
  - service
  - monitoring
  - nomad
  - status-page
---

# Gatus

Gatus ist die Status-Seite des Homelabs fuer die **Kern-Infrastruktur**. Jeder konfigurierte Endpoint gilt als kritisch und bekommt einen Telegram-Alert, sobald er 3x in Folge fehlschlaegt. Alle anderen Services laufen in [Uptime Kuma](../uptime-kuma/index.md).

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [status.ackermannprivat.ch](https://status.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/gatus.nomad` |
| Storage | In-Memory (stateless) |
| Konfiguration | Nomad Template (inline im Job) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Alerting | `custom`-Provider -> `telegram-relay.service.consul:9095` -> Telegram Topic `monitoring` |

## Rolle im Stack

Gatus ist die "Hier leuchtet rot, wenn die Basis brennt"-Seite. Die Check-Liste ist bewusst klein (~19 Endpoints, Stand 2026-04-15) und wird nur erweitert, wenn ein Service wirklich zur Kern-Infra wird. Flaechen-Monitoring liegt in Uptime Kuma.

## Abgrenzung zu anderen Monitoring-Tools

- **Gatus** -- Kern-Infra (Ingress, SSO, DNS, Nomad/Consul/Vault, Storage). Alarmiert sofort. Wenige Checks.
- **Uptime Kuma** -- Alles andere, plus Push-Monitore fuer Batch-Jobs. Details unter [Uptime Kuma](../uptime-kuma/index.md).
- **CheckMK** -- Host-Level Monitoring (CPU, RAM, Disk, SMART)
- **Grafana + Loki** -- Metriken und Logs

## Architektur

```d2
direction: right

Internet: {
  style.stroke-dash: 4
  User: "Besucher\n(via Authentik SSO)"
}

Traefik: Traefik HA {
  style.stroke-dash: 4
  Router: "Router: status.*\nintern-auth@file"
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  Gatus: "Gatus\n(Port 8080)"
  Config: "config.yaml\n(Nomad Template,\ninline im Job)"
}

Core: Kern-Infrastruktur {
  style.stroke-dash: 4
  Ingress: "Ingress\nTraefik Dashboard"
  SSO: "Authentik\nLogin-Flow"
  DNS: "PiHole 01/02\nDNS + Web + Port"
  Cluster: "Cluster Brain\nNomad/Consul/Vault x3"
  Storage: "Speicher\nLinstor + NAS"
}

Relay: "telegram-relay\n(internal service)"

Telegram: "Telegram\nSupergroup Topic\nmonitoring"

Internet.User -> Traefik.Router: HTTPS
Traefik.Router -> Nomad.Gatus
Nomad.Config -> Nomad.Gatus: template { style.stroke-dash: 5 }
Nomad.Gatus -> Core.Ingress: HTTP/TCP Checks
Nomad.Gatus -> Core.SSO
Nomad.Gatus -> Core.DNS
Nomad.Gatus -> Core.Cluster
Nomad.Gatus -> Core.Storage
Nomad.Gatus -> Relay: "POST /notify\n(custom Alert Provider)"
Relay -> Telegram: sendMessage
```

## Kern-Check-Liste

Vollstaendig definiert im Nomad-Template `nomad-jobs/monitoring/gatus.nomad`. Das Wiki nennt hier die Gruppen + Zweck, die Ist-URLs und Conditions sind im Jobfile.

### Ingress

- **Traefik Dashboard** -- `https://traefik.ackermannprivat.ch/` gibt HTTP 200 und antwortet in < 3s.
  Hinweis: Die Dashboard-Route laeuft bewusst ueber `intern-noauth`, nicht ueber `intern-auth`. Waehrend der Keycloak -> Authentik Migration wurde das Traefik-Dashboard nicht als Authentik-Application hinterlegt -- die IP-Allowlist ist der effektive Schutz.

### SSO

- **Authentik Login-Flow** -- `https://auth.ackermannprivat.ch/if/flow/default-authentication-flow/` gibt HTTP 200 in < 5s. Wird nicht `auth/` geprueft, weil der Root-Pfad ein 302 auf den Flow liefert und Gatus per Default keine Redirects folgt.

### DNS (PiHole 01 und 02)

- **DNS-Query** -- DNS A-Query auf beide PiHoles, NOERROR erwartet
- **Web** -- `http://<pihole>/admin/login` liefert HTTP 200 (Port 80, nicht 5480)
- **TCP-Port 53** -- Socket-Connect auf `tcp://<pihole>:53`

### Cluster Brain

Fuer **jeden** der drei Server (04/05/06):

- **Nomad** -- `https://<ip>:4646/v1/status/leader` mit `insecure: true` (Nomad laeuft mit self-signed TLS)
- **Consul** -- `http://<ip>:8500/v1/status/leader`
- **Vault** -- `http://<ip>:8200/v1/sys/health?standbyok=true&perfstandbyok=true` (die Query-Params sorgen dafuer, dass Standby + Performance-Standby-Nodes ebenfalls HTTP 200 liefern)

### Speicher

- **Linstor Controller** -- `http://linstor-controller.service.consul:3370/v1/controller/version`. Consul-DNS-Name statt IP, damit der Check auch nach Controller-Failover stabil ist.
- **Main NAS TCP** -- TCP-Connect auf `10.0.0.200:40001`

## Alerting-Flow

Gatus nutzt den `custom`-Alert-Provider (kein Telegram-Direct-Provider), damit die Nachricht kompakt bleibt und die gleiche Relay-Infrastruktur wie andere Tools verwendet. Details des Relay unter [Telegram-Bots](../monitoring/telegram-bots.md).

- **Custom POST** an `http://telegram-relay.service.consul:9095/notify`
- **Body-Template** (`body: |`-Block im Nomad-Template):
  `{"text":"[ENDPOINT_GROUP]/[ENDPOINT_NAME]: [ALERT_DESCRIPTION]","severity":"[ALERT_TRIGGERED_OR_RESOLVED]","source":"gatus","topic":"monitoring"}`
- **Placeholders** `ALERT_TRIGGERED_OR_RESOLVED` wird via `placeholders:`-Block pro Zustand ersetzt: `TRIGGERED -> warning`, `RESOLVED -> info`. Dadurch setzt der Relay automatisch das passende Emoji-Prefix.
- **Thresholds** `default-alert.failure-threshold=3`, `success-threshold=2`, `send-on-resolved=true`

Das Resultat ist ein Einzeiler pro Alert, z.B.:

- Trigger: `Warning GATUS Ingress/Traefik Dashboard: Traefik Dashboard nicht erreichbar`
- Resolved: `Info GATUS Ingress/Traefik Dashboard: Traefik Dashboard nicht erreichbar`

Das alte Telegram-Direct-Format (mehrere Absaetze mit Condition-Liste, "Description"-Heading, "Condition results"-Heading) ist damit weg.

## Konfiguration

Gesamte Konfiguration inline als Nomad-Template im Jobfile (`nomad-jobs/monitoring/gatus.nomad`). Kein separates Config-File im Repo, kein NFS-Mount, keine persistenten Daten.

::: tip Stateless
Gatus speichert keine Historie persistent. Nach einem Neustart beginnt die Uptime-Historie von vorne. Die Live-Sicht ist das Relevante, Langzeit-Metriken kommen aus InfluxDB.
:::

::: warning Einzige Konfigurationsquelle
Es gab frueher eine verwaiste Kopie unter `infra/configs/gatus/config.yaml`. Sie wurde am 2026-04-15 geloescht -- die Single Source of Truth ist ausschliesslich das Nomad-Template im Jobfile.
:::

## Entscheidungslog

- **Gatus auf Kern-Infra reduziert** (2026-04-15) -- vorher 50+ Endpoints inklusive Media / Apps, jetzt nur noch kritische Infrastruktur. Gruende: Flaechen-Monitoring gehoert in Uptime Kuma (click-driven, flexible), Gatus bleibt auf das fokussiert, was einen sofortigen Alert verdient. Das senkt Alert-Fatigue und macht die Config wartbar.
- **Traefik Dashboard via `intern-noauth`** (2026-04-15) -- Die Authentik-App-Registrierung fuer `traefik.ackermannprivat.ch` fehlte nach der Keycloak-Ausmusterung. Statt eine eigene Authentik-App anzulegen, laeuft der Dashboard-Zugriff nur ueber IP-Allowlist. Traefik ist der Ingress -- eine weitere Auth-Schicht vor dem Ingress selbst ist nicht notwendig, solange die IP-Allowlist greift.
- **Vier Authentik-Apps nachgetragen** (2026-04-15) -- `pdm`, `node-red`, `paperless`, `paperless-ai` wurden bei der Keycloak-Migration vergessen. Policy-Bindings im Blueprint `30-apps-admin-tier.yaml`, Provider + Outposts live nachgezogen.
- **Custom-Alert-Provider statt Telegram-Direct** (2026-04-15) -- Gatus' nativer Telegram-Provider hat kein Template-Feld. Die Umstellung auf `custom` + `telegram-relay` erlaubt einen Einzeiler und reuseable Severity-Semantik.
- **Nomad-Checks auf HTTPS umgestellt** (2026-04-15) -- Die alten Gatus- und Kuma-Checks nutzten `http://`, die Nomad-API laeuft aber mit internem TLS auf 4646. Jetzt `https://` + `client.insecure: true`.

## Verwandte Seiten

- [Uptime Kuma](../uptime-kuma/index.md) -- Flaechen-Monitoring + Push-Monitore, deckt alles ausserhalb der Kern-Infrastruktur
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Alloy, InfluxDB
- [Telegram-Bots](../monitoring/telegram-bots.md) -- `telegram-relay`-Architektur
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains `intern-auth` und `intern-noauth`
- [Authentik](../authentik/index.md) -- Proxy Provider fuer Forward-Auth
