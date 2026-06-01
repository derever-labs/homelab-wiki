---
title: Gatus
description: Öffentliche Status-Seite und sofort-alarmierendes Monitoring der Kern-Infrastruktur
tags:
  - service
  - monitoring
  - nomad
  - status-page
---

# Gatus

Gatus ist die Status-Seite des Homelabs für die **Kern-Infrastruktur**. Jeder konfigurierte Endpoint gilt als kritisch und bekommt einen Telegram-Alert, sobald er 3x in Folge fehlschlägt. Alle anderen Services laufen in [Uptime Kuma](../uptime-kuma/index.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [status.ackermannprivat.ch](https://status.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/gatus.nomad` |
| Storage | In-Memory (stateless) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |

## Rolle im Stack

Gatus ist die "Hier leuchtet rot, wenn die Basis brennt"-Seite. Die Check-Liste ist bewusst klein und wird nur erweitert, wenn ein Service wirklich zur Kern-Infra wird. Flächen-Monitoring liegt in Uptime Kuma.

## Abgrenzung zu anderen Monitoring-Tools

- **Gatus** -- Kern-Infra (Ingress, SSO, DNS, Nomad/Consul/Vault, Storage). Alarmiert sofort. Wenige Checks.
- **Uptime Kuma** -- Alles andere, plus Push-Monitore für Batch-Jobs. Details unter [Uptime Kuma](../uptime-kuma/index.md).
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

Keep: "Keep\nIncident-Hub\nkeep.ackermannprivat.ch"

Telegram: "Telegram\nSupergroup Topic\nmonitoring"

Internet.User -> Traefik.Router: HTTPS
Traefik.Router -> Nomad.Gatus
Nomad.Config -> Nomad.Gatus: template { style.stroke-dash: 5 }
Nomad.Gatus -> Core.Ingress: HTTP/TCP Checks
Nomad.Gatus -> Core.SSO
Nomad.Gatus -> Core.DNS
Nomad.Gatus -> Core.Cluster
Nomad.Gatus -> Core.Storage
Nomad.Gatus -> Keep: "POST /alerts/event/webhook\n(custom Alert Provider)"
Keep -> Telegram: korreliert + routet
```

## Kern-Check-Liste

Vollständig definiert im Nomad-Template `nomad-jobs/monitoring/gatus.nomad`. Das Wiki nennt hier die Gruppen + Zweck, die Ist-URLs und Conditions sind im Jobfile.

### Ingress

- **Traefik Dashboard** -- `https://traefik.ackermannprivat.ch/` gibt HTTP 200 und antwortet in < 3s.
  Hinweis: Die Dashboard-Route läuft bewusst über `intern-noauth`, nicht über `intern-auth`. Während der Keycloak -> Authentik Migration wurde das Traefik-Dashboard nicht als Authentik-Application hinterlegt -- die IP-Allowlist ist der effektive Schutz.
- **Traefik Dashboard - Cert kritisch** -- separater Monitor auf dieselbe URL, der die TLS-Zertifikats-Gültigkeit überwacht.

### SSO

- **Authentik Login-Flow** -- `https://auth.ackermannprivat.ch/if/flow/default-authentication-flow/` gibt HTTP 200 in < 5s. Wird nicht `auth/` geprüft, weil der Root-Pfad ein 302 auf den Flow liefert und Gatus per Default keine Redirects folgt.
- **Authentik - Cert kritisch** -- separater Monitor auf dieselbe URL, der die TLS-Zertifikats-Gültigkeit überwacht.

### DNS (PiHole 01 und 02)

- **DNS-Query** -- DNS A-Query auf beide PiHoles, NOERROR erwartet
- **Web** -- `http://<pihole>/admin/login` liefert HTTP 200 (Port 80, nicht 5480)
- **TCP-Port 53** -- Socket-Connect auf `tcp://<pihole>:53`

### Cluster Brain

Für **jeden** der drei Server (04/05/06):

- **Nomad** -- `https://<ip>:4646/v1/status/leader` mit `insecure: true` (Nomad läuft mit self-signed TLS)
- **Consul** -- `http://<ip>:8500/v1/status/leader`
- **Vault** -- `http://<ip>:8200/v1/sys/health?standbyok=true&perfstandbyok=true` (die Query-Params sorgen dafür, dass Standby + Performance-Standby-Nodes ebenfalls HTTP 200 liefern)

### Speicher

- **Linstor Controller** -- `http://linstor-controller.service.consul:3370/v1/controller/version`. Consul-DNS-Name statt IP, damit der Check auch nach Controller-Failover stabil ist.
- **Main NAS TCP** -- TCP-Connect auf Port 40001 (Synology NAS, siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)).

### Monitoring

- **CheckMK** -- `http://<checkmk>/homelab/check_mk/login.py` liefert HTTP 200, damit die Host-Level-Überwachung selbst nicht stillschweigend ausfällt.

## Alerting-Flow

Gatus nutzt den `custom`-Alert-Provider (kein Telegram-Direct-Provider, der hat kein Template-Feld) und postet seit dem Hard-Cutover am 2026-04-18 an den Keep Incident-Hub `https://keep.ackermannprivat.ch/alerts/event/webhook`. Keep korreliert, dedupliziert und routet von dort an Telegram (Topic `monitoring`) und ntfy. Ein `placeholders:`-Block übersetzt den Zustand auf die Severity (`TRIGGERED -> warning`, `RESOLVED -> info`), und `default-alert` setzt `failure-threshold=3`, `success-threshold=2`, `send-on-resolved=true`. Das genaue Webhook-Body-Schema steht im Nomad-Template `nomad-jobs/monitoring/gatus.nomad`. Details des Hubs unter [Telegram-Bots](../monitoring/telegram-bots.md).

## Konfiguration

Gesamte Konfiguration inline als Nomad-Template im Jobfile (`nomad-jobs/monitoring/gatus.nomad`). Kein separates Config-File im Repo, kein NFS-Mount, keine persistenten Daten.

::: tip Stateless
Gatus speichert keine Historie persistent. Nach einem Neustart beginnt die Uptime-Historie von vorne. Die Live-Sicht ist das Relevante, Langzeit-Metriken kommen aus InfluxDB.
:::

## Entscheidungslog

- **Gatus auf Kern-Infra reduziert** (2026-04-15) -- vorher 50+ Endpoints inklusive Media / Apps, jetzt nur noch kritische Infrastruktur. Gründe: Flächen-Monitoring gehört in Uptime Kuma (click-driven, flexible), Gatus bleibt auf das fokussiert, was einen sofortigen Alert verdient. Das senkt Alert-Fatigue und macht die Config wartbar.
- **Traefik Dashboard via `intern-noauth`** (2026-04-15) -- Die Authentik-App-Registrierung für `traefik.ackermannprivat.ch` fehlte nach der Keycloak-Ausmusterung. Statt eine eigene Authentik-App anzulegen, läuft der Dashboard-Zugriff nur über IP-Allowlist. Traefik ist der Ingress -- eine weitere Auth-Schicht vor dem Ingress selbst ist nicht notwendig, solange die IP-Allowlist greift.
- **Custom-Alert-Provider statt Telegram-Direct** (2026-04-15) -- Gatus' nativer Telegram-Provider hat kein Template-Feld. Die Umstellung auf den `custom`-Provider erlaubt ein eigenes Body-Template und reuseable Severity-Semantik.
- **Alerting auf Keep-Hub umgestellt** (2026-04-18) -- Hard-Cutover des `custom`-Providers von der Telegram-Relay-Direktroute auf den Keep Incident-Hub (`keep.ackermannprivat.ch/alerts/event/webhook`). Keep übernimmt Korrelation, Deduplizierung und Routing nach Telegram/ntfy zentral für alle Monitoring-Quellen.
- **Nomad-Checks auf HTTPS umgestellt** (2026-04-15) -- Die alten Gatus- und Kuma-Checks nutzten `http://`, die Nomad-API läuft aber mit internem TLS auf 4646. Jetzt `https://` + `client.insecure: true`.

## Verwandte Seiten

- [Uptime Kuma](../uptime-kuma/index.md) -- Flächen-Monitoring + Push-Monitore, deckt alles ausserhalb der Kern-Infrastruktur
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Alloy, InfluxDB
- [Telegram-Bots](../monitoring/telegram-bots.md) -- `telegram-relay`-Architektur
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains `intern-auth` und `intern-noauth`
- [Authentik](../authentik/index.md) -- Proxy Provider für Forward-Auth
