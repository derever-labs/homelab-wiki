---
title: Vault - Betrieb
description: Betriebskonzepte für den Vault Raft Cluster
tags:
  - vault
  - betrieb
---

# Vault - Betrieb

## Abhängigkeiten

Vault ist von folgenden Komponenten abhängig, um korrekt zu funktionieren:

- **Raft-Quorum:** Mindestens 2 von 3 Nodes müssen erreichbar sein -- sowohl für Lese- als auch Schreiboperationen
- **Nomad JWKS-Endpunkt:** Für die Workload Identity Validierung ruft Vault den JWKS-Endpunkt von Nomad ab; ist Nomad nicht erreichbar, schlägt die JWT-Authentifizierung fehl
- **Consul:** Service Discovery via `vault.service.consul`; Vault selbst läuft ohne Consul als Storage-Backend (Raft), nutzt Consul aber für die Erreichbarkeit im Netz

## Automatisierung

### Unseal nach einem Reboot {#unseal-nach-reboot}

Vault startet nach jedem Neustart im versiegelten Zustand -- der Speicher bleibt verschlüsselt und ohne Unseal ist kein Secret zugänglich. Das Entsiegeln übernimmt ein lokaler Boot-Service:

- Der Systemd-Service `vault-unseal.service` (oneshot, enabled) läuft beim Start jedes Server-Nodes und ruft das Skript `/usr/local/bin/vault-unseal` auf.
- Das Skript liest die Shamir-Key-Shares aus `/etc/vault.d/unseal-keys` (eine pro Zeile, mode 0600, beim Bootstrap manuell angelegt) und reicht sie einzeln per `vault operator unseal` ein, bis der Threshold von 2 Shares erreicht ist.
- Innerhalb weniger Sekunden nach dem Systemstart ist der Node entsiegelt -- ohne manuellen Eingriff.

Das ist bewusst **kein** herstellerseitiges Auto-Unseal über einen Cloud-KMS oder Transit-Vault: Die Seal-Keys bleiben lokal auf dem Node. Jeder Node hält seinen eigenen Seal-Zustand und wird unabhängig entsiegelt.

### Audit Log Rotation

Die Audit Logs werden via logrotate verwaltet; ältere Logs werden automatisch gelöscht. Details zu Format und Rotation: [Vault Referenz](referenz.md).

### Raft Snapshots

Das Raft-Protokoll erstellt automatisch interne Snapshots zur Zustandssicherung. Kein zusätzlicher Prozess erforderlich.

## Recovery und Break-Glass {#recovery-break-glass}

Dieser Abschnitt behandelt den administrativen Root-Zugang und die manuellen Eingriffe, wenn die Automatik versagt -- etwa wenn Vault nach einem Neustart versiegelt bleibt. Das Entsiegeln von Hand und der Break-Glass-Weg für einen neuen Root-Token stützen sich auf dieselben Shamir-Key-Shares aus `/etc/vault.d/unseal-keys` (Speicherort und Zugang: [Credentials](../_referenz/credentials.md)).

### Vault bleibt versiegelt

Schlägt der Boot-Service fehl und meldet `vault status` weiter `Sealed: true`, wird der betroffene Node von Hand entsiegelt:

1. Auf dem betroffenen Server-Node anmelden.
2. `vault operator unseal` nacheinander mit den Key-Shares aus `/etc/vault.d/unseal-keys` aufrufen -- mindestens 2 der 3 Shares (Threshold).
3. Nach Erreichen des Thresholds wechselt der Node auf `Sealed: false`.

Jeder Node wird einzeln entsiegelt. Das Cluster-Quorum stellt sich her, sobald mindestens 2 Nodes entsiegelt und erreichbar sind.

### Administrativer Root-Zugang {#root-zugang}

Für Admin- und Setup-Aufgaben, die echten Root-Zugriff brauchen -- etwa das erstmalige Einrichten der Nomad-Vault-Integration oder das Reparieren einer Policy oder Auth Method -- hält dieses Homelab bewusst einen permanenten Admin-Root-Token vor. Er liegt in 1Password (Item "Vault Token Privat", Vault "PRIVAT Agent"), nicht als stehendes Secret auf einem Node oder in einer Repo-Datei.

Das ist eine bewusste, pragmatische Entscheidung für ein Ein-Personen-Homelab: Der Root-Token bleibt im verschlüsselten, zugriffsgeschützten Passwort-Manager statt dauerhaft auf einem Server zu liegen. Kein Best-Practice-Ideal, aber ein verbreiteter und vertretbarer Kompromiss zwischen Betriebsaufwand und Sicherheit bei einem einzelnen Operator.

::: tip Verbesserungspotenzial
Heute ist der 1Password-Token ein voller Root-Token. Enger wäre ein Admin-Token mit einer eingeschränkten Policy statt vollem Root -- gleicher Nutzen im Alltag, kleinerer Blast Radius. Verbesserungspotenzial ohne akuten Handlungsbedarf.
:::

### Break-Glass: Root-Token neu erzeugen

Ist der 1Password-Token verloren oder unbrauchbar, lässt sich aus den Shamir-Key-Shares ein neuer Root-Token erzeugen:

1. Das Verfahren mit `vault operator generate-root -init` starten -- Vault gibt ein One-Time-Password (OTP) und eine Nonce aus.
2. Für jeden Key-Share aus `/etc/vault.d/unseal-keys` einen `vault operator generate-root`-Schritt mit derselben Nonce durchführen, bis der Threshold erreicht ist.
3. Vault liefert daraufhin den verschlüsselten Root-Token; das OTP entschlüsselt ihn zum nutzbaren Token.
4. Den neuen Root-Token wieder sicher in 1Password ("Vault Token Privat") ablegen. War es nur eine einmalige Notfall-Aufgabe, den temporären Token stattdessen mit `vault token revoke` widerrufen.

## Bekannte Einschränkungen

::: warning Sealed State nach Neustart
Vault startet immer im versiegelten Zustand. Der Boot-Unseal-Service `vault-unseal.service` löst das normalerweise innerhalb weniger Sekunden nach dem Systemstart. Bleibt Vault versiegelt, ist der Service fehlgeschlagen -- dann manuell entsiegeln (siehe [Recovery und Break-Glass](#recovery-break-glass)).
:::

::: warning Quorum-Verlust
Sind 2 von 3 Nodes offline, verliert Vault sein Raft-Quorum und ist vollständig nicht verfügbar -- weder lesend noch schreibend. Der Cluster erholt sich automatisch, sobald genug Nodes wieder erreichbar sind.
:::

- **Kein TLS:** Bewusste Homelab-Entscheidung. Im isolierten Netz kein Sicherheitsrisiko -- würde aber in einer produktiven Umgebung zwingend sein.
- **KV v2 Überschreiben:** Ein schreibender Zugriff auf ein Secret ersetzt alle Keys des Secrets, nicht nur den angegebenen. Sollen nur einzelne Keys aktualisiert werden, müssen alle bestehenden Keys mitgeschrieben werden.

## Schlüssel und Zugang

Die Shamir Unseal Keys liegen auf den Server-Nodes unter `/etc/vault.d/unseal-keys`; der permanente Admin-Root-Token liegt in 1Password (Item "Vault Token Privat"). Speicherort und Zugang beider sind in [Credentials](../_referenz/credentials.md) dokumentiert. Ist der 1Password-Token nicht verfügbar, lässt sich Root-Zugang per generate-root aus den Unseal Keys neu erzeugen (siehe [Administrativer Root-Zugang](#root-zugang)).

::: danger Sicherheitskritisch
Sowohl der Admin-Root-Token als auch die Unseal Keys (Threshold 2 von 3, über generate-root) ermöglichen vollen administrativen Zugriff auf alle Secrets. Speicherort und Zugang ausschliesslich über den verlinkten Credentials-Eintrag.
:::

## Verwandte Seiten

- [Vault Übersicht](index.md)
- [Vault Referenz](referenz.md)
- [Credentials](../_referenz/credentials.md)
- [Nomad](../nomad/)
