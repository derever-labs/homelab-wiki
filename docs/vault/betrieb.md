---
title: Vault Betrieb
description: Auto-Unseal, manuelles Entsiegeln und Secret-Verwaltung
tags:
  - vault
  - betrieb
  - operations
---

# Vault Betrieb

## Auto-Unseal

Vault startet nach einem Neustart versiegelt (sealed). Ein systemd Service auf jedem Server entsperrt Vault automatisch.

| Eigenschaft | Wert |
|-------------|------|
| Service | `vault-unseal.service` |
| Keys | `/etc/vault.d/unseal-keys` (chmod 600) |
| Trigger | Nach jedem Systemstart |

Der Service liest die Unseal Keys aus der lokalen Datei und führt den Unseal-Vorgang automatisch durch. Der Status kann mit `systemctl status vault-unseal` geprüft werden.

## Manuelles Entsiegeln

Falls der Auto-Unseal Service fehlschlägt, muss Vault manuell entsiegelt werden. Dazu werden 3 von 5 Unseal Keys benötigt.

Ablauf:

1. Status prüfen mit `vault status` -- wenn `Sealed: true`, ist manuelles Entsiegeln nötig
2. Dreimal `vault operator unseal` mit je einem Key ausführen (3 verschiedene Keys erforderlich)
3. Status erneut prüfen -- `Sealed` sollte nun `false` sein

Dieser Vorgang muss auf jedem versiegelten Node einzeln durchgeführt werden.

::: warning Unseal Keys
Die Unseal Keys sind sicherheitskritisch. Speicherort: [Credentials](../_referenz/credentials.md)
:::

## Secret-Verwaltung

Vault nutzt die KV v2 Secret Engine. Secrets werden unter dem Pfad `kv/<job_id>` gespeichert und sind automatisch versioniert.

### Secrets lesen

Mit `vault kv get kv/<pfad>` kann ein Secret abgerufen werden. Beispiel: `vault kv get kv/ssh` zeigt die SSH-Credentials an.

### Secrets schreiben

Mit `vault kv put kv/<pfad> key=value` wird ein Secret geschrieben oder aktualisiert. Bei KV v2 wird automatisch eine neue Version angelegt -- die alte Version bleibt erhalten.

::: warning Überschreiben
`vault kv put` ersetzt alle Keys im Secret. Wenn ein Secret die Keys `user` und `password` hat und nur `password` aktualisiert werden soll, müssen beide Keys angegeben werden. Alternativ `vault kv patch` verwenden.
:::

### Secrets löschen

`vault kv delete` führt einen Soft-Delete durch (Version wird als gelöscht markiert, kann wiederhergestellt werden). `vault kv destroy` löscht eine Version endgültig.

## Voraussetzungen für Vault-Zugang

Für den CLI-Zugang müssen drei Umgebungsvariablen gesetzt werden:

- `VAULT_ADDR` auf die Vault-Adresse (z.B. `http://10.0.2.104:8200`)
- `VAULT_TOKEN` auf das Root Token (Speicherort: [Credentials](../_referenz/credentials.md))

::: info TLS
Vault im Homelab läuft ohne TLS. `VAULT_SKIP_VERIFY` ist daher nicht erforderlich.
:::

## Troubleshooting

### Vault ist Sealed nach Neustart

1. `vault status` auf dem betroffenen Node ausführen
2. Prüfen, ob der Auto-Unseal Service läuft: `systemctl status vault-unseal`
3. Falls der Service fehlgeschlagen ist: Journal prüfen
4. Manuell entsiegeln (siehe oben)
5. Anschliessend den Auto-Unseal Service reparieren und neustarten

### Kein Zugriff auf Secrets

1. Prüfen, ob Vault entsiegelt ist (`vault status`)
2. Token-Gültigkeit prüfen (`vault token lookup`)
3. Policy prüfen: Hat der Job/Token Zugriff auf den angefragten Pfad?
4. Audit Log prüfen unter `/opt/vault/audit/vault-audit.log`

## Verwandte Seiten

- [Vault Übersicht](index.md) -- Architektur und Designentscheide
- [Vault Referenz](referenz.md) -- Auth Methods, Policies, KV-Pfade
- [Credentials](../_referenz/credentials.md) -- Root Token und Unseal Keys
- [Nomad](../nomad/) -- Workload Identity und Secret Injection
