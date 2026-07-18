---
title: E10M20-T1 Freischaltung (DS1825+)
description: Warum die 10GbE-/NVMe-Adapterkarte im HomeServer manuell freigeschaltet werden muss und wie das persistent bleibt
tags:
  - infrastructure
  - storage
  - nas
  - network
  - synology
---

# E10M20-T1 Freischaltung (DS1825+)

Der HomeServer (DS1825+) ist mit einer **Synology E10M20-T1** bestückt -- einer PCIe-Adapterkarte mit einem 10GbE-Port (Aquantia AQC107) und zwei M.2-NVMe-Slots. Die Karte ist **nicht** auf der offiziellen Kompatibilitätsliste der DS1825+ und wird von DSM darum standardmässig gesperrt. Diese Seite erklärt, warum die Karte manuell freigeschaltet werden muss und wie diese Freischaltung über Reboots und DSM-Updates erhalten bleibt.

## Warum eine Freischaltung nötig ist

Synology hat für die 2025er-Plus-Modelle nur die neuere E10G30-Serie (reines 10GbE, ohne M.2) zertifiziert. Die ältere E10M20-T1 (Baujahr 2019, ursprünglich für die 19er-Serie wie das alte DS2419+) fehlt im Hardware Compatibility Layer der DS1825+. Hardware-seitig wird die Karte vollständig erkannt (PCIe-Switch, beide NVMe, der 10GbE-Controller -- alle mit gebundenen Treibern), aber DSM blendet sie auf zwei Wegen aus:

| Komponente | Sperre ohne Freischaltung | Mechanismus |
| :--- | :--- | :--- |
| 10GbE-Port | Interface wird zu `notsup0` umbenannt und bleibt down | Modell fehlt in `adapter_cards.conf` (Sektion `E10M20-T1_sup_nic`) |
| M.2-NVMe | erscheinen nicht im Storage Manager | Modell fehlt in `adapter_cards.conf` (`_sup_nvme`) und in `model.dtb` |

Es handelt sich also um eine reine Software-Whitelist, keinen Hardware-Defekt.

::: warning Kein Synology-Support
Die Freischaltung patcht DSM-Systemdateien und ist von Synology nicht unterstützt. Bei Problemen im Zusammenhang mit der Karte gibt es keinen Hersteller-Support. Die Karte läuft auf eigenes Risiko.
:::

## Was freigeschaltet wird

Die Freischaltung trägt das Modell `DS1825+` in die beiden Adapter-Karten-Konfigurationen ein und aktiviert die Karte im Device Tree:

| Datei | Änderung |
| :--- | :--- |
| `/usr/syno/etc.defaults/adapter_cards.conf` + `/usr/syno/etc/adapter_cards.conf` | `DS1825+=yes` in `[E10M20-T1_sup_nic]` und `[E10M20-T1_sup_nvme]` |
| `/etc.defaults/model.dtb` + `/etc/model.dtb` | `E10M20-T1` aktiviert |

Umgesetzt wird das mit dem Community-Script `syno_enable_m2_card.sh` von 007revad. Als Drittanbieter-Tool ist es nicht im Repo eingecheckt, sondern liegt auf dem NAS unter `/volume1/scripts/syno_enable_m2_card.sh`. Im Repo liegen nur das Wrapper-Script für den Aufgabenplaner und die genaue Vorgehensweise: siehe [`infra/scripts/nas/`](https://github.com/derever-labs/infra/tree/main/scripts/nas).

Nach der Freischaltung und einem Neustart läuft der 10GbE-Port als reguläres Interface (`eth2`, 10 Gbit) statt als `notsup0`.

## Persistenz über Reboots und DSM-Updates

Ein DSM-Update setzt `adapter_cards.conf` und `model.dtb` auf den Auslieferungsstand zurück -- ohne Gegenmassnahme wäre die Karte nach jedem Update wieder gesperrt. Die Freischaltung wird darum über eine **ausgelöste Aufgabe im DSM-Aufgabenplaner** erhalten:

| Attribut | Wert |
| :--- | :--- |
| Task-Name | `enable-e10m20-card` |
| Auslöser | Herunterfahren (nicht Boot-up) |
| Benutzer | `root` |
| Ausführung | Wrapper-Script in `/volume1/scripts/` |

Der Auslöser **Herunterfahren** ist bewusst gewählt: Die `notsup0`-Sperre der NIC greift sehr früh im Boot, bevor der Aufgabenplaner läuft. Ein Shutdown-Task patcht die Konfiguration darum **vor** dem nächsten Start, sodass DSM beim Hochfahren bereits die freigeschaltete Karte sieht. Ein Boot-up-Task käme für den Netzwerk-Teil zu spät.

Das Muster entspricht dem bestehenden Task `ssh-hardening-reapply` (siehe [SSH-Hardening](../../_querschnitt/security/index.md)). Aufgabenplaner-Tasks bleiben über DSM-Updates erhalten; nur die gepatchten Systemdateien werden zurückgesetzt und beim nächsten Herunterfahren neu geschrieben.

::: tip Restfenster nach einem DSM-Update
Direkt nach einem Update ist die Karte beim ersten Boot noch gesperrt, bis der Shutdown-Task beim nächsten Herunterfahren neu patcht. Erst der darauffolgende Start hat die Karte wieder aktiv.
:::

## Stand der NVMe-Nutzung

Die beiden NVMe sind nach der Freischaltung auf Kernel-Ebene verfügbar (`/dev/nvme0`, `/dev/nvme1`). Für die Nutzung als Storage-Pool oder Cache im Storage Manager gilt jedoch eine zusätzliche Hürde:

::: warning M.2-NVMe brauchen HCL-konforme Laufwerke
DSM 7.3 hat die Drittanbieter-Restriktionen für HDDs und SATA-SSDs gelockert, **nicht** aber für M.2-NVMe. NVMe müssen weiterhin auf Synologys Kompatibilitätsliste stehen, um Pools oder Cache anlegen zu können. Zusätzlich blockiert der Storage Manager NVMe in PCIe-Adapterkarten über ein separates GUI-Flag. Beides lässt sich nur mit weiteren Community-Patches umgehen.
:::

## Read-Cache-Eignung für die Mediathek

Für das Mediathek-Szenario (sequenzielles Streaming, selten geschriebene Dateien) ist ein klassischer SSD-Read-Cache **wenig sinnvoll**: DSM 7 cached sequenzielle Grossdatei-Zugriffe nicht mehr (Sequential Bypass), und Metadata-Pinning ist nur mit einem Read-Write-Cache (gespiegeltes NVMe-Paar) verfügbar. Der grössere Nutzen pro SSD entsteht, wenn die NVMe als eigenständiges SSD-Volume für latenzkritische Daten dienen (z. B. Applikations-Datenbanken und Thumbnail-Caches), während die Medien selbst auf den HDDs bleiben.

## Verwandte Seiten

- [NAS-Speicher](./index.md) -- Übersicht NFS-Exports und Garage S3
- [Hosts und IPs](../../_referenz/hosts-und-ips.md)
- [Server-Hardware](../../_referenz/hardware-inventar.md#nas)
