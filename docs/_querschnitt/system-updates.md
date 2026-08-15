---
title: System-Updates (VMs und Hypervisor)
description: Konsolidierte Ansible-Playbooks für apt-Updates auf Linux-Gästen, Proxmox-Hypervisor und Aussenstandorten mit Rollback-Ankern, Gates und Health-Verifikation, dazu die needrestart-Policy für die täglichen unattended-upgrades
tags:
  - querschnitt
  - ansible
  - proxmox
  - updates
  - maintenance
---

# System-Updates (VMs und Hypervisor)

Drei Ansible-Playbooks decken die gesteuerten System-Updates im Homelab ab:

- `vm-system-update-consolidated.yml` patcht die Linux-Gäste des Clusters -- Nomad-Server, Nomad-Worker, Infrastruktur-VMs und die beiden DNS-LXC-Container -- inklusive Rollback-Anker pro Gast, Reboot-Handling und Health-Gates.
- `pve-system-update.yml` patcht die Proxmox-Hypervisor (pve00, pve01, pve02) selbst -- rollend, mit ZFS-Snapshot vom Root-Dataset, HA-Maintenance-Mode und Cluster-Health-Verifikation vor und nach jedem Reboot.
- `edge-system-update.yml` patcht die Single-Node-Aussenstandorte, an denen Gast und Hypervisor am selben Ort hängen.

Dazu kommt `snapshot-cleanup-vms.yml` als eigenständiger Lauf für die Snapshot-Retention.

Alle Playbooks liegen unter `infra/homelab-hashicorp-stack/ansible/playbooks/`, das Inventar unter `infra/homelab-hashicorp-stack/ansible/inventory/hosts.yml`.

::: info Kopfkommentar ist die Bedienungsanleitung
Jedes dieser Playbooks trägt im Kopf die vollständige Aufruf-Referenz: Beispiele, Tags, übersteuerbare Variablen und die Begründung hinter jedem Gate. Diese Seite erklärt Architektur und Betriebsregeln und wiederholt die Aufrufe bewusst nicht -- kanonisch ist der Playbook-Header.
:::

Unabhängig von diesen gesteuerten Läufen zieht jede Ubuntu-VM täglich selbständig Sicherheitsupdates über `unattended-upgrades` (systemd-Timer `apt-daily-upgrade`). Welche Dienste dabei automatisch neu starten dürfen, regelt die needrestart-Policy weiter unten.

## Gäste-Update-Playbook

### Welche Gäste werden erfasst

Das Playbook adressiert die Hostgroups `nomad_servers`, `nomad_workers`, `infrastructure` und `applications`. `manual_updates` (homeassistant) ist ausgeschlossen -- HAOS hat ein eigenes Update-Schema via Web-UI.

Erfasst werden sowohl VMs als auch LXC-Container: die Discovery fragt jeden pve-Node mit `qm list` und `pct list` ab und merkt sich pro Gast, welches der beiden Kommandos für Snapshot und Rollback gilt. Damit laufen die DNS-Container im selben Job wie die VMs, statt von Hand gepatcht zu werden.

Der Edge-Gast in Dottikon (LXC 903) gehört bewusst nicht dazu. Er hat mit `edge-system-update.yml` genau einen Owner, weil dort Gast und Hypervisor am selben Standort hängen und die Reihenfolge zwischen beiden entscheidend ist.

### Betriebsregeln beim Aufruf

- **`--limit` braucht immer `localhost`.** Die Discovery in Phase 0 läuft als eigenes Play auf `localhost`; ein Limit ohne diesen Host filtert sie mit weg, die Gast-zu-Node-Map bleibt leer und der Snapshot-Assert bricht jeden Host ab. Für einzelne Ziele also `localhost:<host>`, für Ausschlüsse `all:!host1:!host2` (dort ist `localhost` implizit enthalten).
- **`serial` bleibt auf 1.** Der Default ist bewusst seriell, nicht aus Komfort: vm-nomad-client-05 und -06 sind die beiden Hälften derselben DRBD-Redundanz. Ein hochgedrehtes `update_serial` läuft in eine harte Sperre, sobald beide Storage-Nodes im selben Batch landen.
- **Snapshot-Cleanup mitlaufen lassen.** Ohne `cleanup_old_snapshots=true` sammeln sich die Pre-Update-Snapshots über die Läufe hinweg an und fressen den ZFS-Pool, der beim nächsten Lauf am Füllstand-Gate hängen bleibt.
- **Aufruf über das `op-env.sh`-Muster.** Das gemeinsame `group_vars/all.yml` löst Gossip-Keys per 1Password-Lookup auf und braucht dafür ein Service-Account-Token in der Umgebung. Die Werte werden nie in die Shell geholt (Details: [Zugangsdaten](../_referenz/credentials.md)).

### Gates und Abbruch-Kriterien

Die Gates sind der eigentliche Kern des Playbooks. Sie brechen den Lauf ab, statt einen Host stillschweigend zu überspringen -- ein übersprungener Host bleibt sonst unbemerkt ungepatcht zurück.

- **Lock-Pre-Check:** Ein Gast mit gesetztem Lock (laufendes vzdump, Migration) kann keinen Snapshot empfangen. Das Playbook stoppt, statt ohne Rollback-Anker zu updaten.
- **ZFS-Füllstand:** Belegt ein Pool auf einem pve-Node mehr als 85 Prozent, bricht der Lauf vor dem ersten Snapshot ab. Snapshot-Deltas und Resync wachsen während des Updates weiter; auf einem vollen Pool scheitern sie mitten im Lauf. Die Schwelle ist bewusst übersteuerbar.
- **Storage-Node-Batch-Sperre:** Sobald beide DRBD-Storage-Nodes im selben `serial`-Batch wären, bricht das Playbook ab. Das schützt gegen ein manuell hochgesetztes `update_serial`, gegen das die einzelnen DRBD-Prüfungen wirkungslos wären -- beide Pre-Checks wären grün, beide Nodes würden gleichzeitig rebooten.
- **PBS-Guard:** Solange auf dem Backup-Server ein Backup-, Verify-, GC- oder Sync-Task läuft, wartet das Playbook bis zu 45 Minuten. Danach bricht es hart ab. Der bewusste Entscheid gegen einen stillen Skip: ein Reboot mitten im Lauf hinterlässt angebrochene Backup-Snapshots, ein unbemerkt ausgelassener Host aber einen ungepatchten Backup-Server.
- **DRBD-Redundanz vor und nach dem Reboot:** Vor dem Eingriff muss jede DRBD-Ressource eine vollständige, synchrone Zweitkopie haben, sonst nimmt der Reboot die einzige gute Kopie offline. Nach dem Reboot wartet das Gate bis zu 30 Minuten auf den Resync, bevor der nächste Host drankommt. Das Fenster ist an einer echten Messung kalibriert -- ein realer Resync brauchte über 21 Minuten, ein knapperes Fenster hätte einen gesunden Host als Fehler markiert.
- **Health-Gates nach dem Reboot:** SSH-Erreichbarkeit, `consul.service` und `nomad.service` aktiv, ein sichtbarer Consul-Leader, der Nomad-Agent auf gesund und auf den Nomad-Servern ein entsiegelter Vault. Alle Dienst-Prüfungen laufen mit Wiederholungen, weil systemd Sekunden nach dem Boot noch `activating` meldet: ein Einmal-Check wertet das als Ausfall.

Reisst ein Gate, bricht der Lauf ab und die noch nicht bearbeiteten Hosts bleiben ungepatcht -- gewollt, damit nicht der nächste Host in dieselbe Störung geschickt wird. Nach dem Beheben wird der Rest mit einem eigenen Lauf nachgezogen.

### Reboot-Entscheid über den Kernel-Vergleich

Ob ein Gast neu startet, entscheidet nicht allein `/var/run/reboot-required`: Das Playbook vergleicht den höchsten in `/boot` installierten Kernel mit dem laufenden. Das schliesst zwei Lücken. Erstens kennen nicht alle Distributionen die Marker-Datei, sie ist ein Ubuntu-Mechanismus. Zweitens hat ein Host, der bereits gepatcht wurde, aber noch auf dem alten Kernel läuft, keine offenen Pakete mehr -- er würde als "nichts zu tun" übersprungen und der neue Kernel bliebe dauerhaft inaktiv. Steht ein Kernel an, läuft der Gast auch ohne offene Pakete durch Reboot und Health-Gates; Snapshot und apt entfallen dann, weil es nichts zu sichern und nichts zu installieren gibt.

Verglichen wird strikt grösser, nicht ungleich: ein entfernter oder zurückgerollter Kernel würde sonst einen Reboot auslösen, obwohl der laufende bereits der neuere ist.

### Ablauf pro Gast

Discovery über alle pve-Nodes, Update-Prüfung im check_mode, Rollback-Anker (`qm` oder `pct snapshot`) nur wenn Updates anstehen, `apt dist-upgrade` nicht-interaktiv, Reboot nach obigem Entscheid, Health-Gates, optionaler Snapshot-Cleanup. Die Discovery ist migrationsresistent und die einzige Quelle für den Node -- ein Inventar-Fallback würde nach einer Migration auf den falschen Node zeigen und dort still ins Leere laufen.

### Smart-Shutdown-Integration

Auf Nomad-Workers greift bei jedem Reboot der [Smart Shutdown](smart-shutdown.md) Mechanismus: nomad node drain, DRBD-Evict, CSI-Mount-Wait laufen automatisch via `ExecStop`-Drop-in auf `nomad.service`. Das Update-Playbook braucht deshalb keinen expliziten Drain-Block.

### Hosts ausserhalb des Jobs

- **vm-checkmk wird nicht durch den Job gepatcht oder rebootet.** Der Monitoring-Host ist die Instanz, die einen Ausfall überhaupt sichtbar macht; fällt er im selben Lauf mit aus, patcht der Job blind. Er bekommt ein eigenes Fenster mit Betreuung. Dieselbe Regel gilt im DCLab.
- **Der Backup-Server läuft nur mit funktionierendem PBS-Guard.** Antwortet die Task-Abfrage nicht, ist der Zustand unbekannt und der Host wird nicht angefasst.

## Snapshot-Retention

Die Retention-Logik liegt als wiederverwendbare Task-Datei unter `playbooks/tasks/snapshot-cleanup.yml` und wird sowohl vom Update-Playbook eingebunden als auch vom Standalone-Playbook `snapshot-cleanup-vms.yml`. Behalten werden die drei neuesten Snapshots je Gast, gelöscht wird alles ältere als sieben Tage; beide Werte sind übersteuerbar. Gelöscht werden nur Snapshots mit den bekannten Präfixen (`backup-`, `pre-update-`, `pre-tuning-`), von Hand angelegte Snapshots bleiben unangetastet.

Das Standalone-Playbook wählt seine Ziele über eine `target_group`-Variable statt über `--limit` -- aus demselben Grund wie oben: ein Limit ohne `localhost` würde die Discovery aushebeln.

## Aussenstandorte

`edge-system-update.yml` bedient die Single-Node-Proxmox-Hosts der Aussenstandorte (Gruppe `proxmox_external`, heute Dottikon und Luzern). Das pve-Playbook ist für sie ungeeignet und lehnt sie bewusst ab: es setzt Quorum und einen zweiten Node als HA-Migrationsziel voraus, beides gibt es hier nicht. Der Standort wird über `edge_target` gewählt.

Vier Regeln prägen das Playbook, alle aus der Tatsache, dass niemand vor Ort ist und der Zugang ausschliesslich über Tailscale läuft:

- **Ein Standort nach dem anderen.** Kommt einer nicht zurück, muss der andere als Vergleichs- und Zugriffspunkt stehen.
- **Erst die Gäste, dann der Host.** Gäste werden gepatcht und neu gestartet, solange der Host noch läuft und ein Rollback per Snapshot möglich ist.
- **Grosszügige Zeitfenster statt früher Abbruch.** Kommt tailscaled nach dem Reboot nicht hoch, ist der Node aus der Ferne tot -- ein zu früher Abbruch macht daraus einen Fehlalarm, ein zu spätes Warten kostet nichts.
- **Dottikon zuletzt.** Dort hängt der externe Proxmox-Watchdog.

Der Lauf endet mit einer Reachability-Verifikation: Host wieder über Tailscale erreichbar, tailscaled verbunden, pve-Kerndienste aktiv, alle vorher laufenden Gäste wieder gestartet und der Edge-Nomad-Agent gesund.

::: warning Gäste mit Bind-Mount bekommen keinen PVE-Snapshot
Proxmox verweigert Snapshots für Gäste mit Bind-Mount vollständig, unabhängig vom Storage -- der Edge-Gast in Dottikon hängt an einem NAS-Share. Liegt das Root-Volume auf ZFS, setzt das Playbook den Rollback-Anker deshalb eine Ebene tiefer als ZFS-Snapshot; auch `pct snapshot` hätte den Bind-Mount nie erfasst. Ist kein Anker möglich, bricht der Lauf ab: aus der Ferne gibt es keinen zweiten Versuch.
:::

## Dienst-Neustarts nach Paket-Updates (needrestart)

Nach jedem apt-Lauf prüft needrestart, welche laufenden Dienste noch alte Bibliotheken im Speicher halten, und startet sie neu. Auf allen sechs Nomad-Hosts ist dieses Verhalten seit dem 15.08.2026 vollständig festgelegt: Restart-Modus `a` (automatisch, ohne Rückfrage) plus eine Blacklist der Dienste, die nicht ungeplant durchstarten dürfen. Die Blacklist unterscheidet sich je nach Rolle des Hosts.

### Warum überhaupt konfiguriert

Der Distro-Default ist `i` (interaktiv). Aus `apt-daily-upgrade` heraus wartet dieser Prompt aber auf niemanden -- der Prozess hält dann die apt-Locks, und der Host bekommt keine Sicherheitsupdates mehr. Im DCLab ist genau das am 29.07.2026 passiert und blieb 16 Tage lang unbemerkt.

Der zweite, weniger offensichtliche Punkt: "nicht konfiguriert" heisst auf Ubuntu nicht "es passiert nichts". Ohne gesetzten Restart-Modus fällt needrestart in den Ubuntu-Modus und startet betroffene Dienste im nicht-interaktiven Kontext ohnehin automatisch durch -- nur ohne Schutzliste. Der Ausfall vom 28.07.2026 war genau das: needrestart stoppte nach einem libc6-Upgrade den drbd-reactor auf vm-nomad-client-05, ohne ihn wieder zu starten, und der LINSTOR-Controller fehlte drei Stunden.

Der explizite Modus `a` ersetzt also kein harmloses Verhalten, sondern macht ein bereits bestehendes berechenbar.

### Welche Dienste geschützt sind

Die Schutzliste wird je Host-Klasse belegt. Beide Klassen haben zusätzlich den Restart-Modus `a` gesetzt.

| Host-Klasse | Hosts | Geschützte Dienste |
| --- | --- | --- |
| Nomad-Server | vm-nomad-server-04, -05, -06 | vault, consul, nomad |
| Nomad-Clients | vm-nomad-client-04, -05, -06 | nomad, docker, containerd, linstor-*, drbd-* |

Auf den Servern wiegt `vault.service` am schwersten: Ein Vault-Restart lässt den Node versiegelt zurück, weil `vault-unseal.service` `Type=oneshot` mit `RemainAfterExit` ist und nach einem Paket-Restart nicht nachläuft. Beim regulären VM-Boot dagegen läuft die Kette vollständig durch. Bei consul und nomad geht es um das Raft-Quorum: Die drei Server patchen unkoordiniert im selben Stundenfenster, und gleichzeitige Restarts auf zwei von drei kosten die Mehrheit.

Auf den Clients wirft ein Restart von nomad, docker oder containerd die Allocations des Nodes weg. Dazu kommt die vollständige LINSTOR-/DRBD-Promoter-Kette: drbd-reactor, `drbd-promote@*` sowie linstor-controller, -satellite, -unlock und -consul-register. Die Kette hängt zusammen; ein Fremd-Restart einzelner Glieder bricht sie, und wenn eine Unit der Sammel-Transaktion nicht starten kann, blockiert der gesamte systemctl-Aufruf samt apt-Lock.

Die LINSTOR-/DRBD-Muster gelten bewusst für alle drei Clients, nicht nur für die beiden Storage-Nodes: vm-nomad-client-04 führt zwar keinen eigenen Storage, fährt aber drbd-reactor und linstor-satellite als diskless Client und war bis zum 15.08.2026 der einzige Client ohne Schutz für diese Kette.

::: tip consul auf den Clients ist bewusst nicht geschützt
Im DCLab steht der Consul-Agent auch auf den Clients auf der Blacklist, im Homelab nicht. Ein Consul-Client-Agent kommt nach einem Restart selbständig zurück und registriert seine Services neu -- anders als bei der DRBD-Kette bleibt nichts dauerhaft kaputt. Die Abweichung ist eine Entscheidung, kein Versehen.
:::

::: warning Geblacklistete Dienste bleiben auf alten Bibliotheken
Ein geschützter Dienst läuft nach einem Bibliotheks-Update so lange mit der alten Bibliothek weiter, bis die VM neu startet. Die Blacklist verhindert den Neustart also nicht, sie verschiebt ihn ins geplante Wartungsfenster. Für alle übrigen Dienste wirkt der Patch sofort.
:::

### Gestaffelte Patch-Fenster der Storage-Nodes

Der Vendor-Default für `apt-daily-upgrade` ist 06:00 mit 60 Minuten Streuung -- damit hätte der Zufall entschieden, ob die beiden Hälften derselben DRBD-Redundanz gleichzeitig patchen. Für die Storage-Nodes gilt deshalb ein fester Versatz: vm-nomad-client-05 um 04:00, vm-nomad-client-06 um 05:30, je mit 15 Minuten Streuung. Im schlechtesten Fall bleiben damit 75 Minuten Abstand.

### Wo es im Code steht

Rolle `ansible/roles/needrestart`, ausgerollt mit `playbooks/deploy-needrestart.yml` auf die Gruppen `nomad_servers` und `nomad_workers`. Die Rolle schreibt ausschliesslich Dateien unter `/etc/needrestart/conf.d/` -- sie enthält keinen Handler und keinen Dienst-Task und kann deshalb selbst keinen Neustart auslösen.

Die Klassen-Belegung der Blacklist steht im Inventory: `ansible/inventory/group_vars/nomad_servers.yml` und `ansible/inventory/group_vars/nomad_workers.yml`. Daneben legen einzelne Dienst-Rollen weiterhin eigene Dateien ab -- `roles/vault`, `roles/drbd-reactor` und `roles/nomad`. Das ist unschädlich, weil needrestart die Einträge aller Dateien in `conf.d` summiert; auf den Storage-Nodes stehen die DRBD-/LINSTOR-Muster deshalb doppelt. Die gestaffelten Patch-Fenster stehen als Gruppen-Variable in `ansible/inventory/group_vars/drbd_storage.yml`.

Die beiden Storage-Nodes werden auch hier einzeln angefasst, mit `--limit` je Host: Sie sind die beiden Hälften derselben DRBD-Redundanz.

Auf den Hosts landet die Policy als `/etc/needrestart/conf.d/zz-restart-auto.conf`. Der `zz-`-Präfix ist nötig, weil needrestart die Dateien in `conf.d` alphabetisch lädt und die ältere `nomad.conf` die Blacklist zuweist statt sie zu ergänzen -- eine früher geladene Zuweisung würde spätere Einträge sonst verwerfen. Der Nomad-Sonderfall ist unter [Smart Shutdown](smart-shutdown.md) beschrieben.

Ob die Policy auf einem Host greift, zeigt `needrestart -m u -b -r l`: Es meldet dann `Disabling Ubuntu mode, explicit restart mode configured`. `-m u` entspricht dem Aufruf des apt-Hooks, `-b` und `-r l` halten den Lauf im reinen Lesemodus.

## PVE-Hypervisor-Update-Playbook

### Cluster-Topologie Homelab

Der Homelab pve-Cluster `Proxmox-Rack-01` hat drei Nodes (pve00, pve01, pve02). Quorum 2 von 3 -- der Reboot eines Nodes ist quorumfähig.

### Sicherheits-Mechanismen vor jedem pve-Reboot

- **Sanity-Check:** Mindestens zwei pve-Nodes müssen im Play sein. `--limit pve01` wird hart abgelehnt, weil HA-Maintenance einen delegate-Ziel-Node braucht.
- **pvecm + ha-manager + ZFS-Pool-Health Pre-Flight:** alle drei müssen quorumfähig, armed und healthy sein. Beim Quorum wird der Wert geprüft, nicht das blosse Vorkommen des Worts: `pvecm status` schreibt die Zeile immer, im Ernstfall als "Quorate: No".
- **ZFS-Füllstand:** dieselbe 85-Prozent-Schwelle wie im Gäste-Playbook, hier je Node.

### Ablauf pro pve-Node

Das Playbook läuft mit `serial: 1` -- immer nur ein Node gleichzeitig:

1. **Backup:** /etc/pve als gzip-Tarball auf dem Node selbst, plus ZFS-Snapshot von `rpool/ROOT/pve-1`.
2. **HA-Maintenance enable:** Setzt den aktuellen Node in Maintenance-Mode -- HA-managed VMs migrieren auf einen der anderen Nodes.
3. **Wait for HA migration:** Pollt `pvesh get /cluster/ha/resources` bis kein Service mit `state=started` mehr auf diesem Node liegt.
4. **apt dist-upgrade non-interactive:** Kein interaktiver Prompt blockiert das Playbook.
5. **Reboot:** ausgelöst über die Marker-Datei oder den Kernel-Vergleich, wie beim Gäste-Playbook.
6. **Wait for pvecm Quorum nach Reboot.**
7. **Verify pve-cluster, pveproxy, pvedaemon, corosync.**
8. **Aktiv warten bis ha-manager keine Services mehr in Transition-State (migrate, request_stop, fence, error) hat** -- ersetzt früheres statisches `pause: 30`.
9. **Warten bis alle vorher laufenden Gäste wieder laufen.** Ein Node-Reboot nimmt alle nicht HA-migrierten Gäste dieses Nodes mit; erst wenn sie zurück sind, ist der Node fertig.
10. **Vault-Gate und DRBD-Gate:** alle Vault-Server wieder entsiegelt, die Storage-Replikate wieder UpToDate -- erst dann darf der nächste Node dran.

Der ganze Flow ab HA-Maintenance ist in einem `block/rescue/always`-Pattern eingewickelt:

- **Block:** der normale Update-Fluss
- **Rescue:** bei Failure wird eine Diagnose-Meldung mit Recovery-Hinweisen ausgegeben (Prüfbefehle, Rollback-Pfad, Backup-Pfad)
- **Always:** `node-maintenance disable` wird in jedem Fall versucht (idempotent, ignoriert eigene Fehler) -- so bleibt nie ein Node im Wartungs-Mode hängen wenn das Playbook abbricht

## Rollback-Pfade

- **Pro Gast:** `qm rollback` beziehungsweise `pct rollback` mit dem Snapshot-Namen, auf dem Hypervisor wo der Gast liegt. Der Name folgt dem Muster `pre-update-<timestamp>` und steht im Playbook-Output und in der Snapshot-Description. Der Zeitstempel wird zu Beginn des Laufs einmalig eingefroren, damit die Rollback-Anweisung am Ende denselben Snapshot nennt, der tatsächlich angelegt wurde.
- **Pro pve-Node:** `zfs rollback rpool/ROOT/pve-1@pve-pre-update-<timestamp> && reboot`. Achtung: ZFS-Rollback löscht alle neueren Snapshots auf dem Dataset.
- **/etc/pve Recovery:** Tarball liegt unter `/root/pve-etc-<timestamp>.tar.gz` auf dem Node selbst.

## Inventar-Gruppen für die Update-Läufe

Das Inventar entscheidet, was ein Lauf anfasst -- deshalb sind die Gruppen Teil der Sicherheitsarchitektur und nicht blosse Sortierung:

| Gruppe | Rolle im Update |
|---|---|
| `nomad_servers`, `nomad_workers`, `infrastructure`, `applications` | Ziele des Gäste-Playbooks |
| `drbd_storage` | Trägt die Batch-Sperre und die DRBD-Gates |
| `manual_updates` | Bewusst ausserhalb (HAOS mit eigenem Update-Weg) |
| `nomad_edge` | Gäste der Aussenstandorte, Owner ist das Edge-Playbook |
| `proxmox_hosts` | Cluster-Hypervisor, Ziel des pve-Playbooks |
| `proxmox_external` | Single-Node-Standorte, Ziel des Edge-Playbooks |

Einträge, die es real nicht gab, sind entfallen: zwei Alt-VMs zeigten auf dieselben Adressen wie die beiden DNS-Container, trugen aber VM-IDs, die auf keinem Node existieren -- der Update-Job hätte diese Gäste doppelt angefasst und ihre Snapshots ins Leere laufen lassen. Ein seit 2026-04 dekommissionierter Zigbee-Host ist ebenfalls raus.

## Verwandte Seiten

- [Smart Shutdown](smart-shutdown.md) -- graceful Drain bei VM-Reboots
- [Cluster Restart](cluster-restart.md) -- Vollständiger Cluster-Restart
- [Linstor Storage](../storage/linstor/index.md) -- DRBD-Replikation und Storage-Backend
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- kanonische Zuordnung von Gästen, VM-IDs und Standorten
