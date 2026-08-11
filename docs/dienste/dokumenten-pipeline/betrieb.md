---
title: Dokumenten-Pipeline Betrieb
description: Dispatch, Image-Weg, Sicherung der Ergebnisdatenbank und Betriebs-Fallstricke der Dokumenten-Pipeline
tags:
  - service
  - batch
  - dokumente
  - betrieb
  - troubleshooting
---

# Dokumenten-Pipeline Betrieb

## Dispatch

Der Job hat keinen Zeitplan. Ein Lauf entsteht durch einen Dispatch mit dem gewünschten Modus, und zwar bewusst von Hand: Läufe kosten Geld und schicken Text nach draussen, das soll eine Entscheidung sein und kein Automatismus.

Dispatcht wird auf dem Cluster-Node, nicht vom Arbeitsplatz aus. Die lokal installierte Nomad-Kommandozeile ist deutlich neuer als der Server; sie spricht ein Dispatch-Protokoll, das der Server nicht kennt, und quittiert das mit einer Fehlermeldung, die wie ein Berechtigungsproblem aussieht. Vom Node aus wird dieselbe Version verwendet, die auch der Cluster fährt.

Auswertende Befehle -- Fortschritt, Kosten, Fehlerbilder, Berichte -- laufen ebenfalls auf dem Node, als kurzlebiger Container gegen dieselbe Datenbank. Dabei gilt die Ein-Schreiber-Regel auch von Hand: Solange ein Lauf aktiv ist, hält er die Sperre neben der Datenbank, und ein zweiter schreibender Aufruf bricht sofort ab. Lesende Auswertungen sind davon nicht betroffen.

## Image-Weg

Das Image wird auf dem Cluster-Node gebaut, nicht auf dem Arbeitsplatz. Der Quellstand kommt als Archiv direkt aus dem Git-Baum, damit ausschliesslich versionierte Dateien ins Image gelangen -- die Arbeitskopie enthält Laufzeitreste, Testdaten und die Ergebnisdatenbank selbst, und nichts davon gehört in ein Image. Gebaut wird lokal auf dem Node und anschliessend mit `skopeo` in die interne [Zot Registry](../../plattform/docker-registry/index.md) geschoben.

Der Tag ist das Commit-Kürzel des gebauten Stands. Ein beweglicher Tag wäre hier gefährlich: Der Job merkt sich im Jobfile genau eine Version, und bei einem Lauf über Tage muss nachvollziehbar bleiben, welcher Code welche Ergebnisse erzeugt hat. Aus demselben Grund steht die Version im Ergebnisdatensatz jedes Dokuments.

::: warning Lokale Images überleben eine Aufräumrunde nicht
Die Aufräumjobs auf den Nodes entfernen ungenutzte Images. Ein Stand, der nur lokal gebaut und nie in die Registry geschoben wurde, ist danach weg -- die Registry ist die einzige verlässliche Quelle. Wer einen Zwischenstand für spätere Läufe braucht, schiebt ihn hoch, statt sich auf den lokalen Docker-Cache zu verlassen.
:::

## Sicherung der Ergebnisdatenbank

Die Datenbank liegt als einzelne Datei node-lokal und damit ohne Replikation (Begründung: [Ergebnisdatenbank](./index.md#ergebnisdatenbank)). Zwei voneinander unabhängige Ketten fangen das auf.

Der periodische Job `batch-jobs/f1-jobsdb-backup.nomad` läuft nachts und erzeugt einen konsistenten Auszug: Zuerst prüft er die Datei auf Integrität, dann streamt er den Auszug durch Komprimierung und Verschlüsselung auf den Backup-Speicher. Entscheidend an dieser Reihenfolge ist, dass nirgends eine unverschlüsselte Zwischendatei entsteht -- der Bestand trägt Volltexte und Klarnamen, und der Backup-Speicher liegt auf dem NAS. Der Schlüssel ist derselbe wie bei den übrigen Cluster-Snapshots, der Wiederherstellungsweg steht im Kopf des Jobfiles. Nach dem Schreiben prüft der Job, ob das Ergebnis tatsächlich verschlüsselt ist und plausibel gross, rotiert die Bestände nach Tagen und Wochen und meldet den Ausgang an [Uptime Kuma](../../monitoring/uptime-kuma/index.md) -- auch den Fehlschlag, mit Grund.

Die zweite Kette ist das Backup der ganzen VM auf den [Proxmox Backup Server](../../storage/backup/index.md). Es deckt den Fall ab, dass nicht die Datei, sondern der Node verloren geht.

::: warning Der Auszug wird nur formal geprüft
Der Job stellt sicher, dass eine verschlüsselte Datei plausibler Grösse entstanden ist. Ob sich daraus eine funktionsfähige Datenbank zurückspielen lässt, prüft er nicht -- dafür müsste er den Auszug entschlüsseln, und der private Schlüssel gehört nicht in einen nächtlichen Batch-Job. Diese Einschränkung teilt der Job mit den übrigen Backup-Jobs im Cluster.
:::

## Versionssprung der Datenbank

Ein neues Image bringt oft eine höhere Schema-Version mit. Der Sprung wird bewusst ausgelöst und nicht dem ersten Produktivlauf überlassen: Ein lesender Befehl migriert nie (siehe [Referenz](./referenz.md#schema-versionierung)), also hebt ein Trockenlauf des Extraktionsschritts die Datenbank kontrolliert an, bevor irgendein Dispatch startet. Bricht er ab, ist das die Gelegenheit, den Grund zu verstehen -- mitten in einem mehrstündigen Lauf ist sie es nicht.

Daraus folgt die harte Reihenfolge bei laufendem Betrieb: erst den laufenden Prozess beenden lassen, dann das neue Image ausrollen, dann migrieren, dann wieder dispatchen. Wird ein neuer Stand gestartet, während ein alter noch schreibt, hebt der neue die Version und der alte trifft danach schreibend auf ein Schema, das er nicht kennt.

## Troubleshooting

### Dispatch scheitert vom Arbeitsplatz aus

**Symptom:** Der Dispatch bricht mit einer Fehlermeldung ab, die nach fehlender Berechtigung oder einem unbekannten Endpunkt aussieht, während dieselbe Aktion auf dem Node funktioniert.

**Ursache:** Versions-Drift zwischen lokaler Kommandozeile und Cluster. Die neuere Kommandozeile nutzt einen Aufrufweg, den die ältere Server-Version nicht anbietet.

**Konzept:** Dispatch und Handbetrieb laufen grundsätzlich auf dem Node. Das gilt für alle Nomad-Befehle mit Job-Wirkung, nicht nur für diesen Job.

### Ein Lauf bricht sofort mit Sperrmeldung ab

**Symptom:** Der Start meldet, die Datenbank sei von einem anderen Lauf gesperrt, und beendet sich ohne Arbeit.

**Ursache:** Die Pipeline hält während schreibender Arbeit eine exklusive Sperre auf einer Datei neben der Datenbank. Ein zweiter Lauf -- auch ein von Hand gestarteter Container -- läuft in diese Sperre.

**Konzept:** Das ist kein Fehler, sondern der Schutz. SQLite verträgt genau einen Schreiber, und ein paralleler zweiter Lauf würde nicht doppelt so schnell arbeiten, sondern die Buchführung über Kosten und Fortschritt zerlegen. Vor dem Start prüfen, ob noch eine Allocation läuft; verwaiste Sperren nach einem harten Abbruch verschwinden mit dem Prozess.

### Nach einem Abbruch stehen Dokumente dauerhaft in Arbeit

**Symptom:** Der Fortschritt zeigt Dokumente als in Bearbeitung, obwohl kein Lauf aktiv ist.

**Ursache:** Ein hart beendeter Prozess -- etwa nach einem Ausfall des Nodes -- kann seine Ansprüche auf einzelne Dokumente nicht mehr zurückgeben.

**Konzept:** Die Verarbeitung ist wiederaufnehmbar und pro Dokument gebucht; ein neuer Lauf setzt an derselben Stelle fort und gibt hängengebliebene Ansprüche frei. Deshalb wiederholt sich der Job auch nicht von selbst: Ein blinder Wiederholungslauf würde die Ursache eines Abbruchs verdecken, statt sie sichtbar zu machen.

### Ein Dokument taucht nach dem Import nicht in Paperless auf

**Symptom:** Der Import meldet Erfolg oder ein Duplikat, das Dokument ist im Archiv aber nicht zu finden.

**Ursache:** Zwei verschiedene Fälle sehen gleich aus. Entweder hat die Zielinstanz die Datei als inhaltsgleiche Dublette eines bereits vorhandenen Dokuments abgewiesen -- die Prüfung dort schliesst auch gelöschte Dokumente im Papierkorb ein --, oder der Upload lief durch, aber die Rückmeldung mit der Dokumentnummer kam nicht mehr an.

**Konzept:** Der Import unterscheidet diese Fälle in seiner Buchführung und bucht den zweiten Fall als abgeschlossen ohne Nummer, statt ihn zu wiederholen. Ein Wiederholungsversuch wäre der teurere Fehler: Er erzeugt entweder ein zweites Exemplar oder läuft in die Dublettenprüfung. Details zum Verhalten der Zielinstanz: [Paperless Betrieb](../paperless/betrieb.md).

## Verwandte Seiten

- [Dokumenten-Pipeline](./index.md) -- Architektur, Datenschutz-Zuschnitt und Rolle im Stack
- [Dokumenten-Pipeline Referenz](./referenz.md) -- Modi, Kommandos, Schema-Versionierung, Datenschutz-Schichten
- [Paperless Betrieb](../paperless/betrieb.md) -- Import-Weg und Dublettenverhalten der Zielinstanz
- [Batch Jobs](../../_querschnitt/batch-jobs.md) -- Übersicht der periodischen und parametrisierten Jobs
- [Backup](../../storage/backup/index.md) -- Backup-Architektur und Proxmox Backup Server
- [Zot Container Registry](../../plattform/docker-registry/index.md) -- Herkunft des Job-Images
