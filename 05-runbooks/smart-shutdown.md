# Runbook: Smart Shutdown (Nomad & Linstor)

Dieses Runbook beschreibt die Implementierung des unterbrechungsfreien Shutdown-Prozesses für Nomad-Clients mit Linstor/DRBD Storage.

## Problemstellung
Beim Standard-Shutdown beendet systemd Dienste oft parallel. Wenn der Nomad-Agent oder das Netzwerk beendet werden, bevor die Storage-Volumes ausgehängt sind, entstehen "Stale Locks" und Filesystem-Fehler (Read-Only).

## Lösung (Version v9.0)
Die Lösung basiert auf einer Trennung der Logik in zwei spezialisierte Systemd-Units.

### 1. Nomad Shutdown Drain (`nomad-shutdown-drain.service`)
Diese Unit hakt sich direkt in den Shutdown-Prozess ein und führt den Drain aus, solange Nomad und das Netzwerk noch aktiv sind.
- **Typ:** `oneshot`
- **Trigger:** `WantedBy=shutdown.target reboot.target halt.target`
- **Aktion:** `nomad node drain -enable -self -ignore-system`

### 2. Nomad Boot Enable (`nomad-boot-enable.service`)
Diese Unit aktiviert den Node nach dem Hochfahren automatisch wieder.
- **Typ:** `oneshot`
- **Trigger:** `After=nomad.service`
- **Aktion:** `nomad node drain -disable -self`

## Skript-Speicherort
Das zentrale Steuerungsskript liegt auf den Nodes unter:
`/usr/local/bin/nomad-smart-shutdown.sh`

## Logs prüfen
Der Verlauf des letzten Shutdowns/Boots kann hier eingesehen werden:
`tail -f /var/log/nomad-shutdown.log`
