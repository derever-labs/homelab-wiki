---
title: Vault Referenz
description: Auth Methods, Policies, KV-Pfade und Audit Logging
tags:
  - vault
  - referenz
  - secrets
---

# Vault Referenz

## Auth Methods

| Eigenschaft | Wert |
|-------------|------|
| Auth Method | `jwt-nomad` |
| JWKS URL | `http://10.0.2.104:4646/.well-known/jwks.json` |
| Default Role | `nomad-workloads` |

Nomad stellt auf jedem Server einen JWKS-Endpunkt bereit. Vault validiert die JWT-Signatur gegen diesen Endpunkt und stellt bei erfolgreicher Prüfung ein Vault-Token mit der Policy `nomad-workloads` aus.

## Policies

| Policy | Beschreibung |
|--------|--------------|
| `nomad-workloads` | Erlaubt Nomad-Tasks Secrets unter `kv/data/<job_id>` zu lesen |
| `operator` | Jobs deployen, Logs lesen, Allocs verwalten (Nomad-seitig) |

Die `nomad-workloads` Policy stellt sicher, dass jeder Job nur seine eigenen Secrets lesen kann. Der Pfad wird aus der Job-ID abgeleitet: `kv/<job_id>`.

## KV-Pfade

Secrets für Nomad-Jobs folgen der Konvention `kv/<job_id>`. Vollständige Liste aller Secret-Pfade und Credentials: [Credentials](../_referenz/credentials.md)

| Beispiel-Pfad | Verwendung |
|----------------|-----------|
| `kv/postgres` | PostgreSQL-Credentials |
| `kv/grafana` | Grafana Admin-Passwort und Datasource-Tokens |
| `kv/traefik` | Cloudflare API-Credentials für DNS Challenge |
| `kv/ssh` | SSH-Credentials |

## Audit Logging

Alle Vault-Zugriffe werden protokolliert.

| Eigenschaft | Wert |
|-------------|------|
| Log-Datei | `/opt/vault/audit/vault-audit.log` |
| Rotation | Logrotate (30 Tage, komprimiert) |
| Format | JSON (ein Eintrag pro Zeile) |

Das Audit Log erfasst jeden API-Aufruf an Vault, einschliesslich Auth-Versuche, Secret-Reads und -Writes. Sensitive Werte werden im Log automatisch gehasht.

## Service URLs

| Service | URL |
|---------|-----|
| Vault API | `http://10.0.2.104:8200` |
| Nomad JWKS | `http://10.0.2.104:4646/.well-known/jwks.json` |

## Wichtige Pfade

| Pfad | Verwendung |
|------|------------|
| `/opt/vault` | Vault Daten |
| `/opt/vault/audit/vault-audit.log` | Audit Log |
| `/etc/vault.d/unseal-keys` | Auto-Unseal Keys (chmod 600) |

## Vault Service Discovery

Nomad verbindet sich zu Vault über Consul DNS statt einer hardcodierten IP:

```
address = "http://vault.service.consul:8200"
```

Vault registriert sich automatisch bei Consul mit Tags (`active` für den Leader, `standby` für Follower). Standby-Nodes leiten Requests per HTTP 307 an den aktiven Leader weiter. Dadurch ist die Verbindung resilient -- bei einem Leader-Wechsel löst Consul DNS automatisch den neuen Leader auf.

::: info
`vault.service.consul` gibt alle Vault-Nodes zurück (active + standby). Falls nur der Leader gewünscht ist: `active.vault.service.consul`.
:::

## Verwandte Seiten

- [Vault Übersicht](index.md) -- Architektur und Designentscheide
- [Vault Betrieb](betrieb.md) -- Unseal, Secret-Verwaltung, Troubleshooting
- [Credentials](../_referenz/credentials.md) -- Vollständige Secret-Pfade und Speicherorte
- [Nomad](../nomad/) -- Workload Identity Integration
