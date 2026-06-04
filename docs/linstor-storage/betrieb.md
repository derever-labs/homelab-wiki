# LINSTOR Storage — Betrieb

::: info SSOT
Betriebshandbuch für den LINSTOR/DRBD-Storage-Cluster im Homelab.
:::

## Cluster-Topologie

- **c04** (10.0.2.124) — diskless DRBD-Tiebreaker (Quorum-Voter, keine Daten)
- **c05** (10.0.2.125) — diskful, COMBINED + LINSTOR-Controller (via drbd-reactor-Promoter)
- **c06** (10.0.2.126) — diskful
- DRBD-Replikation über Thunderbolt-Bond (10.99.1.105/106), nur c05 ↔ c06

## Volumes

Replizierte App-Volumes (rg-replicated, 2× UpToDate + c04 Tiebreaker):

banner-pb, flame, flame-intra, gitea, keep-data, loki, mariadb-data, mosquitto,
obsidian-livesync, pocketbase, stash-secure, zot-data

## Quorum & Tiebreaker

- `auto-add-quorum-tiebreaker=True` — LINSTOR fügt c04 automatisch als Tiebreaker hinzu
- Bei Quorum-Verlust: `suspend-io` (Daten bleiben konsistent, IO blockiert bis Quorum zurück)
- **NIE** `peer-tiebreaker` manuell auf resource-connections setzen — das entzieht LINSTOR
  das Tiebreaker-Management (Ergebnis: `Vote=No`). Korrektur: Property leeren und die
  c04-Ressource mit `--keep-tiebreaker` neu anlegen lassen.

## Backup

Die LINSTOR-Volumes werden **nicht LINSTOR-nativ** gesichert:

- **Proxmox Backup Server** sichert die Storage-VMs (c05/c06) inkl. der LINSTOR-Daten-Disk
  als Block — die Volumes sind damit abgedeckt.
- **Applikationskonsistente Dumps** (PostgreSQL/MariaDB/InfluxDB) laufen zusätzlich nach
  `/nfs/backup`.

Die frühere LINSTOR-S3-Schicht (Snapshot → Garage, Schedule `backup-daily`, Master-Key-
Auto-Unlock) wurde am 2026-05-31 zurückgebaut — sie war redundant zu PBS und bei grossen
Volumes unzuverlässig. Details: [Backup-Strategie](/backup/).

## fstrim & Bit-Rot-Schutz

Zwei Nomad-Jobs härten den Storage auf den Consumer-NVMe (ohne Power-Loss-Protection):

- **fstrim** (`batch-jobs/fstrim.nomad`, sysbatch c05/c06, wöchentlich So 06:00) — gibt
  ungenutzte Blöcke an den LVM-Thin-Pool zurück. Voraussetzung, seit die Volumes mit
  `noatime` statt `discard` gemountet sind.
- **drbd-verify** (`batch-jobs/drbd-verify.nomad`, periodic So 07:00) — iteriert sequenziell
  `drbdadm verify` über alle replizierten Ressourcen und deckt Bit-Rot (out-of-sync-Blöcke)
  auf. Das `verify-alg` allein prüft nichts ohne periodischen Lauf.

Beide senden am Run-Ende einen Kuma-Push-Heartbeat (Monitore `fstrim` / `drbd-verify`).

## Häufige Operationen

- **Volume-Status:** `linstor resource list -r <volume>` auf dem Controller-Node (c05)
- **Node-Reboot (Storage-Disziplin):**
  - **NIE** c05 + c06 gleichzeitig rebooten (2-of-2-Quorum für Daten)
  - Reihenfolge: c06 → warten auf UpToDate → dann c05
  - c04 kann jederzeit rebootet werden (nur Tiebreaker)

## Verwandte Seiten

- [LINSTOR Storage](/linstor-storage/)
