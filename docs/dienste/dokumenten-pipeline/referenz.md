---
title: Dokumenten-Pipeline Referenz
description: Betriebsmodi, Kommandos, Schema-Versionierung und Datenschutz-Schichten der Dokumenten-Pipeline
tags:
  - service
  - nomad
  - batch
  - dokumente
  - referenz
---

# Dokumenten-Pipeline Referenz

Technische Details zum Nomad-Job `batch-jobs/f1-pipeline.nomad` und zum Werkzeug dahinter. Die Werte selbst stehen im Jobfile und im Quellcode (Gitea-Repository `sam/nas-aufraeumung`, Einstiegspunkt `f1-pipeline/run.py`); diese Seite beschreibt Struktur und Begründung.

## Betriebsmodi

Der Job ist parametrisiert. Ein Dispatch verlangt zwingend einen Modus, alle weiteren Meta-Schlüssel sind freiwillig.

| Modus | Was er tut | Externe Aufrufe |
| :--- | :--- | :--- |
| `stufe0-scan` | Bestand erfassen, Text extrahieren, Namens-Lexikon prüfen | keine |
| `kalibrierung` | Stichprobe ziehen, Klassifikation und Metadaten messen, Kosten hochrechnen | ja |
| `volllauf` | durchgehende Verarbeitung des offenen Bestands, wiederaufnehmbar | ja |

Die optionalen Meta-Schlüssel steuern Mengenbegrenzung, Parallelität, Anfragerate, Zufallssaat, Trockenlauf und die abgeschaltete Grobsortierung. Sie haben bewusst leere Vorgabewerte, damit die Konfigurationsdatei im Image die einzige Quelle für Grenzwerte bleibt und das Jobfile nichts davon spiegelt. Ganzzahl-Parameter werden im Job vor dem Start geprüft, damit ein Tippfehler im Dispatch nicht erst mitten im Lauf auffällt.

## Kommandos

Alle Befehle laufen über denselben Einstiegspunkt und arbeiten auf derselben Ergebnisdatenbank. Der Nomad-Job ruft je nach Modus die passende Kette auf; von Hand werden vor allem die auswertenden Befehle gebraucht.

| Befehl | Zweck |
| :--- | :--- |
| `scan` | Verzeichnis in die Job-Datenbank aufnehmen, wahlweise nur die verarbeitbaren Formate |
| `extract` | Text und technische Befunde je Dokument gewinnen |
| `classify` | Klassifikation und Metadaten über den externen Modell-Dienst |
| `status` | Fortschritt je Stufe und Zustand des Bestands |
| `costs` | aufgelaufene Kosten und Kosten je Dokument aus den gebuchten Aufrufen |
| `fehler` | fehlgeschlagene Dokumente nach Fehlerklasse |
| `stufe0-report` | Trefferbericht der Namens-Prüfung über den ganzen Bestand |
| `korrektur` | Feldkorrekturen einzeln setzen oder als Datei einlesen |
| `kalibrier-report` | Feldgenauigkeit gegen die eingelesenen Korrekturen |
| `zweitmeinung` | zweites Modell als Prüfinstanz über bestehende Ergebnisse |
| `ocr-import` | extern erzeugte Texterkennungs-Ergebnisse einspielen |
| `paperless-import` | fertige Dossiers nach Paperless hochladen |
| `embeddings` | Vektoren für die Ähnlichkeitssuche berechnen |
| `zensieren` | lokal eine geschwärzte Fassung aus den Fundstellen erzeugen |

Der Import nach Paperless nimmt standardmässig nur Dossiers, die das Gate bestanden haben und als Record eingestuft sind. Zwei Schalter weichen das bewusst auf: Der eine nimmt auch die vom Gate zurückgestellten Dokumente mit -- das Gate schützt den Versand nach draussen, Paperless steht im eigenen Netz --, der andere sperrt einzelne Dokumente über eine Ausschlussliste hart aus. Der Import bucht zweiphasig gegen Doppel-Uploads, lädt Mutterdokumente vor ihren Anhängen und unterscheidet Netzfehler danach, ob sie vor oder während des Uploads auftreten.

Der Import über die Texterkennung berührt Originale nie: Die Erkennung schreibt eine neue Datei, eingespielt wird nur deren Text. Die Zuordnung läuft über den Hash des Originals und nicht über den Pfad -- ein zwischenzeitlich verschobenes Dokument findet seinen Text trotzdem wieder.

## Volumes und Platzierung

| Volume | Ort | Zugriff | Inhalt |
| :--- | :--- | :--- | :--- |
| `nfs-home-samuel` | NAS-Home über NFS, auf beiden Storage-Nodes vorhanden | nur lesen | der zu sichtende Dokumentenbestand |
| `f1-pipeline-daten` | lokale Disk von `vm-nomad-client-05` | schreibend | Ergebnisdatenbank, Laufprotokolle, Zwischenstände |

Der Unterschied in der Ansible-Definition ist der Grund für den Node-Pin: Das Bestands-Volume ist gruppenweit für alle Storage-Nodes deklariert, das Daten-Volume nur in den `host_vars` genau eines Nodes. Damit kann der Scheduler den Job gar nicht erst anderswo platzieren -- und läuft nicht in den Fall, dass er auf dem zweiten Node eine zweite, leere Datenbank anlegt, statt an der bestehenden weiterzuarbeiten. Bei Paperless ist es umgekehrt gelöst, weil Nomad diesen Dienst verschieben können muss (siehe [Paperless Referenz](../paperless/referenz.md#platzierung)).

Das Nur-Lese-Recht auf den Bestand steht an drei Stellen unabhängig voneinander: im Kernel-Mount, in der Volume-Deklaration und im Container-Bind. Warum die Staffelung nötig ist und nicht eine Stelle genügt: [Nur-Lese-Garantie](./index.md#nur-lese-garantie).

## Schema-Versionierung

Die Ergebnisdatenbank trägt ihre Schema-Version in einer Metatabelle, der Code seine erwartete Version als Konstante. Zwei Regeln machen den Umgang damit vorhersehbar:

- **Migrationen sind additiv.** Neue Spalten und Tabellen kommen dazu, bestehende werden nicht umgedeutet und nicht entfernt. Ein Bestandsdatensatz bleibt damit gültig, auch wenn er neuere Felder nicht kennt.
- **Nur schreibende Befehle migrieren.** Ein lesender Befehl auf einer älteren Datenbank bricht mit einer Versionsmeldung ab, statt sie stillschweigend zu heben. Der Grund ist Nachvollziehbarkeit: Eine Auswertung soll nie nebenbei die Datenbank verändern, an der gerade ein anderer Stand gemessen wird.

Umgekehrt bricht der Code hart ab, wenn die Datenbank neuer ist als er selbst. Ein altes Image auf eine bereits gehobene Datenbank loszulassen ist der gefährlichere Fall, weil es schreibend auf Strukturen trifft, die es nicht kennt. Wie ein Versionssprung im Betrieb kontrolliert vollzogen wird, steht in [Betrieb](./betrieb.md#versionssprung-der-datenbank).

## Datenschutz-Schichten

Vor jedem Weg nach draussen liegen drei unabhängige Schichten. Sie sind gestaffelt, weil jede für sich eine andere Lücke schliesst.

| Schicht | Prüft | Wirkung bei Treffer |
| :--- | :--- | :--- |
| Namens-Prüfung (Stufe 0) | den extrahierten Text gegen ein kleines Lexikon besonders schützenswerter Namen, wortgrenzengenau | hartes Ausschlusskriterium: das Dokument wird von jeder externen Verarbeitung ausgenommen, unabhängig von allen anderen Einstellungen |
| Gate | die vom Modell erzeugten Freitexte gegen längere Ziffernfolgen, das Lexikon und die eigenen Fundstellen | die betroffenen Felder werden zurückgestellt und verlassen das Netz nicht |
| Extern-Projektion | welche Dossier-Felder überhaupt weitergegeben werden dürfen | alles ausserhalb der Positivliste bleibt lokal; das Dossier als Ganzes geht nie hinaus |

Die Positivliste umfasst die Einordnung eines Dokuments -- Kategorie, Dokumentart, Datum und dessen Herkunft, Sprache, Ablageziel, Absendertyp -- sowie Zusammenfassung, Schlagworte, die Begründung der Wichtigkeitsstufe und die Bausteine des Namensvorschlags. Nicht enthalten sind Volltexte, Namen, Referenz- und Vertragsnummern sowie Beträge. Die vier Freitextfelder durchlaufen dabei zuerst das Gate und erst danach die Projektion -- ein Modell kann in einen Begründungssatz hineinschreiben, was im Volltext stand, und genau das fängt die Reihenfolge ab.

::: info Zwei verschiedene Aussenwelten
Die Schichten unterscheiden, wohin etwas geht. Die Klassifikation selbst läuft über einen Modell-Dienst mit Schweizer Rechenzentrum; die Projektion regelt zusätzlich, was aus den Ergebnissen in die Arbeits- und Auswertungsumgebung gelangen darf. Volltexte gehören in keinem der beiden Fälle dazu.
:::

## OCR-Kaskade

Die Texterkennung ist als Eskalation gebaut: Zuerst wird bestimmt, in welchem Zustand ein Dokument ist, danach entschieden, was zu tun ist -- und ausdrücklich auch, was zu unterlassen ist.

| Zustand | Vorgehen |
| :--- | :--- |
| brauchbarer Textlayer vorhanden | übernehmen, keine Erkennung |
| schwacher Textlayer | Zweitlauf mit lokaler Erkennung |
| kein Textlayer, unberührte Vorlage | Erstlauf mit lokaler Erkennung |
| Erkennung bereits gelaufen und gescheitert | Bildmodell auf eigener Hardware |
| Vektorzeichnung oder leere Seite | keine Erkennung, dort ist nichts zu holen |

Zwei Befunde aus einem Vergleichslauf sind fest verdrahtet, weil sie teuer erkauft und leicht wieder zu vergessen sind. Erstens ist das Überschreiben eines vorhandenen Layers gesperrt: Es hat den Altlayer der Scanner-Software in keinem Fall zuverlässig ersetzt und stattdessen Textdubletten erzeugt, im Extremfall mit fast doppeltem Textbestand. Zweitens schadet ein pauschaler Zweitlauf über alles: Der Gewinn steckt vollständig im untersten Qualitätsband, im obersten verlieren Dokumente messbar. Daraus folgen zwei unabhängige Netze -- eine Schwelle, unterhalb derer ein Zweitlauf überhaupt beginnt, und eine Annahme-Prüfung nach dem Lauf, die am konkreten Ergebnis misst.

## Verwandte Seiten

- [Dokumenten-Pipeline](./index.md) -- Architektur, Datenschutz-Zuschnitt und Rolle im Stack
- [Dokumenten-Pipeline Betrieb](./betrieb.md) -- Dispatch, Image-Bau, Sicherung, Betriebs-Fallstricke
- [Paperless-ngx](../paperless/index.md) -- Zielablage für Records
- [Paperless Referenz](../paperless/referenz.md) -- Konfigurationsentscheide der Zielinstanz
- [Nomad Referenz](../../plattform/nomad/referenz.md) -- Job-Konfigurationsmuster
