---
title: Paperless Betrieb
description: Import-Weg, Versionslinie und Troubleshooting von Paperless-ngx
tags:
  - service
  - dms
  - betrieb
  - troubleshooting
---

# Paperless Betrieb

## Import-Weg

Der Massenimport läuft über die REST-API und nicht über den Consume-Ordner. Der Grund ist nicht Bequemlichkeit: Über die API kommen die Metadaten aus der [Dokumenten-Pipeline](../dokumenten-pipeline/index.md) direkt mit, und die Duplikatserkennung des Consumers kann keine Originale löschen, weil sie nur die temporäre Upload-Kopie zu sehen bekommt.

Der Import spricht die Instanz bewusst über die Node-Adresse an statt über Traefik -- das umgeht die Authentik-Umleitung, die einen Token-basierten API-Aufruf sonst auf eine Login-Seite schicken würde. Deshalb bleibt die Liste der erlaubten Hosts auch offen konfiguriert: Eine Einschränkung würde genau diesen Weg brechen, während die Instanz von aussen ohnehin nur hinter Traefik und `intern-auth@file` erreichbar ist.

## Versionslinie

Die Instanz bleibt bewusst auf der 2er-Hauptversion. Version 3 bringt Breaking Changes, die genau diesen Job treffen: Die Variable für die Archivdatei-Erzeugung wird ersetzt, das Werteset des OCR-Modus ändert sich, und das Verhalten bei Duplikaten dreht sich. Eine frische Hauptversion auf eine täglich genutzte Instanz zu heben, während zehntausende Dokumente importiert werden, ist die falsche Reihenfolge -- das Upgrade ist ein eigenes Vorhaben nach dem Import.

Das Image ist auf seinen Digest gepinnt. Ein Tag allein hätte bei einem unbemerkten Upstream-Rebuild genau die Version gewechselt, die hier bewusst festgehalten wird.

## Troubleshooting

### Dokumente verschwinden nach einem Reschedule

**Symptom:** Der Sanity-Check meldet für jedes Dokument "Original of document does not exist" und "Thumbnail of document does not exist", obwohl die Datenbank die Dokumente kennt.

**Ursache:** Der Container mountet an seinem Datenvolume vorbei. Genau das ist zwischen Dezember 2025 und Juli 2026 passiert: Ein Init-Skript, das die Symlinks auf das CSI-Volume anlegen sollte, wurde nirgends aufgerufen. Gemountet wurden dadurch leere Verzeichnisse im Allocation-Pfad, der ohne `sticky` und ohne `migrate` bei jedem Reschedule verloren geht. Die Dokumente selbst lagen unversehrt auf dem Volume.

**Konzept:** Die Pfade werden heute direkt über Umgebungsvariablen gesetzt, nicht mehr über Symlinks aus einem Skript, und der Start-Guard prüft den NAS-Mount aktiv. Der Grundfehler ist verallgemeinerbar: Ein fehlender Host-Pfad erzeugt bei Docker still ein leeres Verzeichnis, ein Dienst schreibt dann fehlerfrei ins Nichts. Wo ein Pfad kritisch ist, gehört ein Marker geprüft und der Start abgebrochen.

### Start-Guard meldet "nicht beschreibbar", obwohl der Dienst schreiben darf

**Symptom:** Der prestart-Task bricht mit fehlendem Schreibrecht ab, der Mount ist aber vorhanden und der Hauptcontainer könnte schreiben.

**Ursache:** Der Export bildet `root` auf `guest` ab. Prüft der Guard als `root`, misst er nicht das Recht des Dienstes, sondern das von `guest` -- ein falsches Negativ, das wie ein Mount-Defekt aussieht. Hintergrund: [NAS-Storage: Betrieb](../../storage/nas/betrieb.md#schreibtest-als-root-schlagt-trotz-rw-export-fehl).

**Konzept:** Guard und Hauptcontainer laufen mit derselben Benutzerkennung, damit der Guard exakt das prüft, was der Dienst später tut. Dieselbe Regel gilt für jede Prüfung von Hand auf diesem Mount.

### Neue Dateien im Consume-Ordner bleiben liegen

**Symptom:** Eine Datei liegt im Consume-Ordner, Paperless nimmt sie nicht auf, im Log passiert nichts.

**Ursache:** Netzlaufwerke liefern keine Dateisystem-Benachrichtigungen. In der Standardkonfiguration wartet Paperless auf inotify-Ereignisse, die auf NFS nie eintreffen.

**Konzept:** Der Consumer pollt das Verzeichnis in einem festen Takt. Wer den Takt ändert, ändert damit die Latenz für alle manuell abgelegten Dateien -- der API-Weg ist davon nicht betroffen.

### Ein Dokument lässt sich nicht erneut importieren

**Symptom:** Der Import einer Datei schlägt mit Duplikatsmeldung fehl, obwohl das Dokument in der Oberfläche nicht auffindbar ist.

**Ursache:** Die Duplikatsprüfung vergleicht gegen die Prüfsummen aller Dokumente einschliesslich der gelöschten. Ein Dokument im Papierkorb blockiert damit den erneuten Import derselben Datei.

**Konzept:** Vor einem Wiederholungsimport den Papierkorb prüfen und dort endgültig entfernen. Beim Weg über den Consume-Ordner ist zusätzlich zu beachten, dass die Eingangsdatei bei einem Treffer physisch gelöscht wird.

## Verwandte Seiten

- [Paperless-ngx](./index.md) -- Architektur, Hybrid-Ablage und Rolle im Stack
- [Paperless Referenz](./referenz.md) -- Volumes, Pfade und Konfigurationswerte
- [Dokumenten-Pipeline](../dokumenten-pipeline/index.md) -- Quelle der importierten Dokumente und Metadaten
- [NAS-Storage: Betrieb](../../storage/nas/betrieb.md) -- NFS-Troubleshooting und Squash-Verhalten
