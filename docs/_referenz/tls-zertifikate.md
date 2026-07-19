---
title: "TLS-Zertifikate"
description: Drei getrennte Zertifikatspfade im Homelab -- Traefik-Wildcard, direktes NAS-Zertifikat und Proxmox-Node-Zertifikate
tags:
  - referenz
  - tls
  - zertifikate
  - acme
  - traefik
  - nas
---

# TLS-Zertifikate

## Übersicht

Das Homelab verwendet drei vollständig getrennte Zertifikatspfade -- alle drei via Let's Encrypt (ACME) mit Cloudflare DNS-01-Challenge, aber mit unterschiedlichen ACME-Clients, Subdomains und Challenge-Records:

- **Pfad 1:** Traefik als ACME-Client -- Wildcard `*.ackermannprivat.ch` für alle reverse-proxied Services
- **Pfad 2:** `acme.sh` direkt auf dem NAS (DS1825+) -- dediziertes Zertifikat für `login.ackermannprivat.ch` inkl. nativer Synology-Dienste
- **Pfad 3:** Proxmox-eigener ACME-Client (`pvenode acme`) -- eigenes Zertifikat je Node-FQDN (Details im Abschnitt unten)

Die Challenge-Records sind kollisionsfrei, da sie auf unterschiedliche Subdomains ausgestellt werden:
- Traefik: `_acme-challenge.ackermannprivat.ch` (Wildcard)
- acme.sh auf NAS: `_acme-challenge.login.ackermannprivat.ch` (Single-Hostname)
- Proxmox: `_acme-challenge.<node-fqdn>`

## Architektur

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

CF: Cloudflare DNS {
  class: node
  tooltip: "Zone ackermannprivat.ch, DNS-01-ACME-Validierung via TXT-Records"
}

path1: Pfad 1 -- Traefik Wildcard {
  class: container

  Traefik: "Traefik HA\n(vm-traefik-01 / vm-traefik-02)" {
    class: node
    tooltip: "certificatesResolvers Cloudflare DNS-01, EC256. acme.json lokal je VM"
  }
  Services: "Reverse-proxied Services\n(*.ackermannprivat.ch)" {
    class: node
    tooltip: "Alle Homelab-Services hinter Traefik -- TLS-Terminierung zentral"
  }
  Traefik -> Services: "TLS terminiert\n(Wildcard-Cert)"
}

path2: Pfad 2 -- NAS direkt {
  class: container

  AcmeSH: "acme.sh\n(nativ auf NAS)" {
    class: node
    tooltip: "/usr/local/share/acme.sh, installiert mit --nocron, crontab Mittwoch 04:00"
  }
  DSMStore: "DSM-Cert-Store" {
    class: node
    tooltip: "reloadcmd-Script kopiert das Cert in alle System- und Paket-Dienst-Stores und lädt nginx neu"
  }
  DSMServices: "DSM-Web + Drive (Port 6690) + Photos" {
    class: node
    tooltip: "DSM terminiert TLS direkt auf allen Ports -- kein Proxy dazwischen"
  }
  AcmeSH -> DSMStore: "--install-cert\nreloadcmd"
  DSMStore -> DSMServices: "synosystemctl\nrestart nginx"
}

path3: Pfad 3 -- Proxmox-Nodes {
  class: container

  PVE: "pvenode acme\n(alle Proxmox-Nodes)" {
    class: node
    tooltip: "Eingebauter ACME-Client, Cert je Node-FQDN, automatische Erneuerung"
  }
}

path1.Traefik -> CF: "_acme-challenge\n.ackermannprivat.ch" {
  style.stroke: "#2563eb"
}
path2.AcmeSH -> CF: "_acme-challenge\n.login.ackermannprivat.ch" {
  style.stroke: "#16a34a"
}
path3.PVE -> CF: "_acme-challenge\nje Node-FQDN" {
  style.stroke: "#854d0e"
}
```

## Pfad 1 -- Traefik (Wildcard `*.ackermannprivat.ch`)

Traefik ist der ACME-Client für alle reverse-proxied Services. Details zur Traefik-Architektur, dem HA-Setup und der Zertifikatsspeicherung: [Traefik Reverse Proxy](../edge/traefik/index.md).

- Challenge: Cloudflare DNS-01, Algorithmus EC256
- Speicherort: `/opt/traefik/acme/acme.json` (lokal auf beiden Traefik-VMs, je eigene Kopie)
- Erneuerung: vollautomatisch durch Traefik, keine manuelle Intervention nötig
- Geltungsbereich: alle Services unter `*.ackermannprivat.ch` und `*.ackermann.systems`

::: info traefik-certs-dumper abgelöst (2026-06)
Der früher verwendete `traefik-certs-dumper`-Container exportierte Zertifikate nach `/nfs/cert/`. Er ist entfernt: kein Cluster-Konsument hat `/nfs/cert/` gelesen (verifiziert, 0 offene Handles auf allen Nodes). Mit dem NAS-Cutover wurden der Container, der NFS-Mount in `roles/nfs`, der NFS-Export und der NAS-Shared-Folder `cert` vollständig abgebaut. Native Synology-Dienste erhalten ihr Zertifikat über Pfad 2 (siehe unten).
:::

## Pfad 2 -- NAS (DS1825+, `login.ackermannprivat.ch`)

Das Synology-DSM-Webinterface und native Synology-Dienste brauchen ein gültiges TLS-Zertifikat direkt auf dem NAS. Hintergrund: Details zur NAS-Architektur: [NAS Storage](../storage/nas/index.md).

### Warum ein direktes Zertifikat auf dem NAS

::: warning Synology Drive synct über ein proprietäres Protokoll auf Port 6690
Ein HTTP-Reverse-Proxy wie Traefik kann den nativen Sync-Traffic nicht tunneln. Nur Web-UIs wären über Traefik erreichbar -- die Sync-Dienste nicht. Das Zertifikat muss deshalb direkt auf dem NAS liegen; DSM terminiert TLS auf allen Diensten und Ports selbst.

Ein reines Tailscale-Setup scheidet aus, weil die Client-Geräte nicht auf Tailscale laufen.
:::

### Sicherheitseinordnung

::: warning Synology CVE-Historie -- Härtung ist Pflicht
Direkter Internetzugang zu DSM ist mit Risiko verbunden (Beispiel: CVE-2024-10443 RISK:STATION, zero-click RCE). Erforderliche Massnahmen: DSM-Firewall, Auto-Block, 2FA. Diese Härtung ist Voraussetzung, keine Option.
:::

### Mechanismus

`acme.sh` läuft nativ auf dem NAS (kein Container) unter `/usr/local/share/acme.sh`, installiert mit `--nocron`.

**Ausstellung und Erneuerung:**

- Domain: `login.ackermannprivat.ch`
- Challenge: Cloudflare DNS-01 (getrennt von Traefik: `_acme-challenge.login.ackermannprivat.ch`)
- Cron-Eintrag in `/etc/crontab`: wöchentlich, Mittwoch 04:00, `acme.sh --cron` -- `synocrond` lädt ihn ein

**Verteilung ins DSM:**

`acme.sh --install-cert` mit `reloadcmd`-Script `/usr/local/share/acme.sh/dsm-deploy/install-to-dsm.sh`. Das Script:
1. Kopiert Cert und Key in den DSM-Default-Cert-Store (`/usr/syno/etc/certificate/_archive/<DEFAULT>`)
2. Kopiert Cert und Key in alle System- und Paket-Dienst-Stores
3. Führt `synosystemctl restart nginx` aus

::: info Warum kein offizieller acme.sh `synology_dsm`-Deploy-Hook
Der offizielle Hook registriert das Zertifikat über die DSM-Cert-API -- auf diesem DSM erkannte die API das hochgeladene Cert nicht zuverlässig. Das `reloadcmd`-Script bildet stattdessen den bewährten Mechanismus des früheren `cert.sh` nach, wird aber von nativem `acme.sh` getrieben (abgelöst 2026-06).
:::

## HashiCorp Stack -- TLS-Status

Consul und Nomad kommunizieren intern bewusst ohne TLS. Diese Homelab-Entscheidung eliminiert für diese beiden Dienste das Risiko von Zertifikats-Expiry-Ausfällen. Vault bildet die Ausnahme und läuft seit 2026-07-15 auf HTTPS (`:8200`) mit einer privaten CA; die Nomad-Integration vertraut der CA über `ca_file` in der `vault {}`-Stanza. Der Cluster-Traffic ist zusätzlich abgesichert:

- **Consul:** ohne TLS, Gossip Encryption (symmetrischer Key) schützt den Cluster-Traffic
- **Nomad:** ohne TLS, ACLs aktiv
- **Vault:** TLS über private CA, zusätzlich Audit Logging und ACLs aktiv

## Proxmox-Nodes -- eigene ACME-Zertifikate

Die Proxmox-Nodes laufen **nicht** hinter Traefik und holen ihre TLS-Zertifikate selbst direkt über den eingebauten ACME-Client (`pvenode acme`). Account `ackermannprivat`, Validierung via Cloudflare DNS-01 (CF-Credentials in `/etc/pve/priv/acme/plugins.cfg`).

| Attribut | Wert |
| :--- | :--- |
| Aussteller | Let's Encrypt |
| Challenge-Typ | DNS-01 (Cloudflare) |
| ACME-Client | Proxmox-eigen (`pvenode acme`), kein Traefik |
| Erneuerung | Automatisch durch Proxmox |

Die Node-FQDNs (`pveXX.ackermannprivat.ch`, `pve-lu-01.ackermannprivat.ch`, `pve01.nana.ackermannprivat.ch`) lösen via Pi-hole-Split-DNS auf die jeweilige Tailscale-IP auf. Dadurch funktioniert in PDM die Anbindung über **FQDN + CA-Trust** (ohne IP-im-SAN und ohne fragiles Fingerprint-Pinning).

## Verwandte Seiten

- [Traefik](../edge/traefik/) -- Reverse Proxy und Zertifikatsverwaltung
- [NAS Storage](../storage/nas/) -- Synology DS1825+, DSM-Dienste
- [Vault](../plattform/vault/) -- Secrets Management und Security-Entscheidungen
- [Proxmox](../infrastruktur/proxmox/) -- PDM-Anbindung und Node-Übersicht
