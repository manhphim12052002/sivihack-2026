<!-- Titel wird im specification-template.xml gesetzt # Änderungshistorie -->

## Version 2.2.0

Änderungen wurden an Kapitel 1 bis 5 (s. [#76](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/76)) sowie an folgenden Bereichen des Standards vorgenommen:

### Business Terms (Kapitel 8)

#### Geändert

* `BT-75`: (Beschreibung): "Die Beschreibung der finanziellen Sicherheitsleistung, die der 
  Bieter bei der Einreichung seines Angebots vorlegen muss. So kann die Sicherheitsleistung beispielsweise in der Form einer Zahlung an den Beschaffer oder eines von einer Bank ausgestellten Dokuments geleistet werden. **In der Regel verfällt der Rückgabe- bzw. Rückerstattungsanspruch des Bieters, wenn ein Bieter den Zuschlag für den Auftrag erhalten hat, jedoch die Verpflichtungen nicht erfüllt.**" (s.
  [#105](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/105))

* `BT-63`: (Beschreibung): "Angaben dazu, ob die Einreichung von Angeboten durch die Bieter, in denen die Anforderungen des Beschaffers auf eine andere Art und Weise erfüllt werden als in den **Vergabeunterlagen** vorgeschlagen, obligatorisch, zulässig oder untersagt ist. Weitere Bedingungen für die Einreichung von **Nebenangeboten** sind in den **Vergabeunterlagen** enthalten." (s.
  [#97](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/97))

* `BT-135`, `BT-136`, `BT-1252` : (Name und Beschreibung): Präzisierung zu "Auftragsvergabe ohne vorherige Bekanntmachung" (s.
  [#92](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/92))

* `BT-727`: (Name und Beschreibung und Hinweis): "Erfüllungsort - **Optionen** bei Dienstleistungen" (s.
  [#91](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/91))

* `BT-57`: (Beschreibung): "Sonstige Informationen über die Verlängerung(en). **Hier können weitere Angaben zur Ausgestaltung der Vertragsverlängerungen gemacht werden, beispielsweise falls diese nicht aus der Vervielfachung der exakten Grundvertragslaufzeit bestehen.**" (s. 
  [#85](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/85))

* `BT-36`: (Name): "Laufzeit - **maximale** Dauer" (s. [#84](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/84))

* `BT-113`: (Name und Beschreibung): "Rahmenvereinbarung — Höchstzahl der **Auftragnehmer**" und "Die Höchstzahl der **Auftragnehmer** an der Rahmenvereinbarung." (s. [#81](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/81))

* `BT-715`, `BT-716`, `BT-725`  (Syntax binding): Spezifischere XPATH zur semantischen Eindeutigkeit für die relevanten Bekanntmachungen definiert (s. [#86](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/86) [#71](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/71))

* `BT-708` (Kardinalität): Freiwillig für Vorinformationen (Formulare 4-9) (s. [#103](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/103))

* `BT-506` (Kardinalität): Anpassungen für alle Formulare auf EU Vorgabe (s. [#109](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/109))

* `BT-715`: (Hinweis): "Wenn BT-715 "Fahrzeugzahl" größer als 600 oder kleiner als 1 ist, sollte durch die Vergabestelle dieser Wert und ob BT-768 "Auftrag als Teil einer Rahmenvereinbarung" korrekt gefüllt ist, geprüft werden." (s. [#108](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/108))

### Codelisten (Kapitel 7)

#### Hinzugefügt

* `reserved-execution`: Der Wert `not-known` für die Angabe von "Noch nicht bekannt" in BT-736 "Ausführung vorbehalten" wird aus der Codeliste entfernt. (s. [#93](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/93))

#### Geändert

* `received-submision-type`: Zur Vereinfachung der Codeliste werden optionale Werte entfernt (s. [#102](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/102))

* `buyer-legal-type`: Aktualisierung von Label (s. [#98](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/98))

* `legal-basis`: Neuer Wert `32024R2509` hinzugefügt (s. [#106](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/106))


### Geschäftsregeln (Kapitel 9)

#### Geändert

* `BR-DE-24`: Anpassung der Regel an fachliche Vorgaben (s. 
  [#96](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/96)

#### Hinzugefügt

* `BR-DE-33`: "(Gesamt-)Fahrzeuge (BT-715) ≥ Saubere Fahrzeuge (BT-716) ≥ Fahrzeuge emissionsfrei (BT-725)" (s. [#74](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/74))

* `BR-DE-34`: "Die Angabe von BT-768 ist verpflichtend, wenn BT-717 'ja' ist." (s. [#75](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/75))

* `BR-DE-39`: "Wenn BT-715 'Fahrzeugzahl' größer als 600 oder kleiner als 1 ist, sollte durch die Vergabestelle dieser Wert und ob BT-768 'Auftrag als Teil einer Rahmenvereinbarung' korrekt gefüllt ist, geprüft werden." (s. [#90](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/90))

#### Rausgenommen

* `BR-DE-26` ist temporär ausgesetzt (s. [#107](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/107))


### Bekanntmachungen (Kapitel 10)

#### Geändert

* `9.17.` (Name): `Noticetype 19` korrigiert zu: "Konzessionsbekanntmachung – Konzessionsrichtlinie, Standardregelung" (s. [#87](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/87))

* `9.20.` (Name): `Noticetype 21` korrigiert zu: "Auftragsbekanntmachung – Sektorenrichtlinie, Sonderregelung" (s. [#87](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/87))

* `9.24.` (Name): `Noticetype 25` korrigiert zu: "Bekanntmachung für die Zwecke der freiwilligen Ex-Ante-Transparenz – allgemeine Richtlinie" (s. [#68](https://projekte.kosit.org/eforms/eforms-de-specification/-/work_items/68))


## Version 2.1.0

Änderungen wurden an folgenden Bereichen des Standards vorgenommen:

### Business Terms (Kapitel 7)

#### Geändert

* `BT-625` (Hinweis): "Sofern eine Maßeinheit im vorliegenden Fall nicht anwendbar ist, kann der Umfang der Leistungen über BT-24 „Beschreibung“ angegeben werden." (s. [#65](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/65))

* `BT-132`, `BT-133`, `BT-134`  (Name und Beschreibung): Präzisierung zu "Eröffnungstermin" (s. [#63](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/63))  

* `BT-501` (Beschreibung): "Öffentliche Stellen **können hier ihre** im Rahmen der eRechnung für den öffentlichen Auftrag bzw. die Konzession zu verwendende Leitweg-ID **eintragen**, **sofern diese für die eRechnung verwendet wird.** Für Unternehmen bzw. andere Wirtschaftsteilnehmende ist grundsätzlich die jeweilige Wirtschafts-Identifikationsnummer einzutragen. Solange oder soweit diese nicht zur Verfügung steht, ist eine andere eindeutige Identifikationsnummer eindeutig identifizierbar zu benennen, vorzugswürdig die jeweilige Umsatzsteuer-ID oder ein Registereintrag (in Deuschland vorzugswürdig aus dem jeweiligen Handelsregister). Eintragungen können beispielsweise lauten: Leitweg-ID xxx-xxxxxxxxxx - xx / UStID. xxxxxxxxxx / HR xxxxxx (AG XY) / xxxx UK Company Register XY. **In allen anderen Fällen und** bei natürlichen Personen kann zum Schutz personenbezogener Daten "keine Angabe" eingetragen werden." (s. [#64](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/64))  
 

### Codelisten (Kapitel 6)

* Deutsche angepasste Codelisten sind kompatibel mit Version 2024-12-20.
  * Insbesonders wurde `suitable-business-type` entfernt, da es keiner nationalen Anpassung mehr Bedarf .
* EU Codelisten sind kompatibel mit TED SDK 1.13.0


### Geschäftsregeln (Kapitel 8)

#### Hinzugefügt

* `BR-DE-32`:  "Angabe von BT-132 (Eröffnungstermin), BT-133 (Ort des Eröffnungstermin) nur bei Vergaben von Bauleistungen nach VOB, bei denen Angebote noch schriftlich eingereicht werden können, also in BT-17 (Einreichung — elektronisch) nicht "obligatorisch" eingetragen ist." (s. [#114](https://projekte.kosit.org/eforms/eforms-de-schematron/-/issues/114)) 

#### Geändert

* `BR-DE-23`: Regel ausgesetzt (s. [#112](https://projekte.kosit.org/eforms/eforms-de-schematron/-/issues/112)) 


## Version 2.0.0

Diese Fassung dient vorrangig der möglichst frühzeitigen Bereitstellung von Änderungen, die durch das Amendment 2023 (Durchführungsverordnung (EU) 2023/2884 zur Änderung der Durchführungsverordnung (EU) 2019/1780) erforderlich werden und der TED eForms-SDK 1.12.0 Veröffentlichung. TED unterstützt noch nicht alle Änderungen des Amendment 2023, daher sind wesentliche Änderungen bisher nur in den Bereichen Foreign Subsidy Regulation (FSR, Verordnung über drittstaatliche Subventionen), Eignungskriterien und Ausschlussgründe zu finden.

Änderungen des Amendments 2023 und TED eForms-SDK werden hier nicht wiedergeben. stattdessen sei auf die Original-Quellen verwiesen:

* Amendment 2023: <https://ec.europa.eu/docsroom/documents/58074>
* TED eForms-SDK: <https://github.com/OP-TED/eForms-SDK/blob/1.12.0/CHANGELOG.md>

Aufgrund der oben genannten Änderungen handelt es sich um ein Major Release.

Nationale Anpassungen wurden an folgenden Bereichen des Standards vorgenommen:

### Business Terms (Kapitel 7)

#### Geändert
  
* `BT-682` (Beschreibung): "Ergebnis gemäß Verordnung (EU) 2022/2560 über den Binnenmarkt verzerrende drittstaatliche Subventionen bezüglich des bezuschlagten Angebots." (s. [#62](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/62))

* `BT-681` (Hinweis): "Bitte beachten Sie, dass aufgrund des geschätzten Auftragswerts auf Grundlage der Verordnung (EU) 2022/2560 vom 14.12.2023 über den Binnenmarkt verzerrende drittstaatliche Subventionen eine Meldung bzw. Erklärung gemäß Anhang II der Durchführungsverordnung (EU) 2023/1441 der EU-Kommission vom 10.07.2023 erforderlich sein kann." (s. [#55](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/55))


* `BT-726` (Beschreibung): "Der Beschaffer weist darauf hin, dass diese Beschaffung auch für Kleinst­unternehmen, kleine Unternehmen oder mittlere Unternehmen (KMU) geeignet ist, worunter in Anlehnung an die Empfehlung 2003/361/EG der Europäischen Kommission üblicherweise Unternehmen verstanden werden, die weniger als 250 Personen beschäftigen und die entweder einen Jahresumsatz von höchstens 50 Mio. EUR erzielen oder deren Jahresbilanzsumme sich auf höchstens 43 Mio. EUR beläuft." (s. [#51](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/51)) 

* `BT-77` (Name): "Wesentliche Finanzierungs- und Zahlungsbedingungen." (s. [#52](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/52)) 

* `BT-88` (Beschreibung): "Diese Angaben sind zu machen, wenn die Verfahrensart nicht zu den in den EU-Vergaberichtlinien genannten Verfahrensarten gehört. Hier sind die wichtigsten Merkmale des Verfahrens (z. B. Beschreibung der einzelnen Stufen) einzutragen sowie Informationen darüber, wo die vollständigen Vorschriften für das Verfahren zu finden sind. Dies kann beispielsweise bei Vergabe von Konzessionen der Fall sein, bzw. wenn es sich um soziale oder andere besondere Dienstleistungen handelt oder im Falle einer freiwilligen Veröffentlichung von Vergabeverfahren mit einem Wert unterhalb der EU-Schwellenwerte für die Auftragsvergabe. Wenn Binnenmarktrelevanz einer unterschwelligen Vergabe vorliegt, kann das ebenfalls in diesem Feld (beispielsweise mit einem Verweis auf die UVgO) dargestellt werden." (s. [#49](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/49))

* `BT-58` (Name): "Verlängerung - Maximale Anzahl" (s. [#48](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/48))

* `BT-92` (Beschreibung): "Einzelabrufe/Einzelaufträge/Bestellungen werden elektronisch erteilt." (s. [#53](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/53))

* `BT-750` (Hinweis): "Siehe Geschäftsregel BR-DE-30." (s. [#45](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/45))

* `BT-67(b)` (Hinweis): "Wenn bei BT-806 „Procurement Document“ ausgewählt wird, kann in BT-67(b) folgender Text angegeben werden: „Neben den Ausschlussgründen gem. § 123 und 124 GWB gelten ggf. weitere Ausschlussgründe, die in den Vergabeunterlagen zu finden sind.“ Auch die Angabe eines Deeplinks in BT-67b ist möglich." (s. [#43](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/43)) 

* `BT-706` und `BT-746` (Beschreibung): Deutsche Anpassung mit neuster deutscher Beschreibung des Amendments ersetzt. (s. [#42](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/42))

### Codelisten (Kapitel 6)

#### Hinzugefügt

* `foreign-subsidy-measure-conclusion`: Neue angepasste Codes zur nationalen Umsetzung der Foreign Subsidy Regulation (Verordnung über drittstaatliche Subventionen) (s. [#62](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/62))

#### Geändert 

* `social-objectives` (Code): "other" ergänzt um Beispiele: "Sonstiges, bspw. Bindung/Einhaltung von Tarifverträgen Berücksichtigung von Werkstätten aus dem Justizvollzug (sog. Knastläden)" (s. [#54](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/54)) 

* `missing-info-submission` (Bezeichnung): Geänderte deutsche Bezeichnungen. (s. [#50](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/50))
  * late-all:  "Die Nachforderung von Erklärungen, Unterlagen und Nachweisen ist nicht ausgeschlossen."
  * late-some: "Die Nachforderung von Erklärungen, Unterlagen und Nachweisen ist teilweise ausgeschlossen."
  * late-none: "Die Nachforderung von Erklärungen, Unterlagen und Nachweisen ist ausgeschlossen."

* `exclusion ground (BT-67(a))`: Neue angepasste Codes zur nationalen Umsetzung der Ausschlussgründe aufgrund neuer und gebündelter Codes seitens der EU (s. [#44](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/44)) 

### Geschäftsregeln (Kapitel 8)

#### Hinzugefügt

* `BR-DE-29`: "Der BT-92 soll nur bei Rahmenvereinbarungen zulässig sein." (s. [#53](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/53))

* `BR-DE-30`: "Wenn bei BT-821 „Procurement Document“ ausgewählt wird, muss in BT-750 ein Deeplink zu der Datei mit den Eignungskriterien oder (besser noch) der Stelle in der Datei, an der sich die Eignungskriterien befinden, angegeben werden." (s. [#45](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/45))

* `BR-DE-31`: "Die Feldlänge ist auf 5 Stellen zu begrenzen." (s. [#48](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/48))

## Version 1.2.0

Änderungen wurden an folgenden Bereichen des Standards vorgenommen:

### Business Terms (Kapitel 7)

#### Geändert

* `BT-726` (Name): Besonders **auch** geeignet für KMU.
* `BT-300` (Hinweis): Nun kann auch `other-sme` ausgewählt werden und Mehrfachnennungen sind möglich.  
* `BT-501` (Beschreibung): Erster Satz geändert in "**Öffentliche Stellen** tragen hier **grundsätzlich** ihre im Rahmen der eRechnung für den öffentlichen Auftrag bzw. die Konzession zu verwendende Leitweg-ID ein."

### Codelisten (Kapitel 6)

* Deutsche angepasste Codelisten sind kompatibel mit Version 2023-02-02.
  * Insbesonders wurde `vehicle-category` als neue angepasste Codeliste aufgenommen.
* EU Codelisten sind kompatibel mit TED SDK 1.10.1

### Geschäftsregeln (Kapitel 8)

#### Rausgenommen

* `BR-DE-25`: Da Rechtsgrundlage noch nicht abschliessend geklärt ist.

#### Geändert

* `BR-DE-26`: Wert `other-sme` ist zusätzlich erlaubt.

## Version 1.1.0

Änderungen wurden an folgenden Bereichen des Standards vorgenommen:

### Business Terms (Kapitel 7)

#### Rausgenommen

* Es werden nur noch BGs und BTs dargestellt, die Verwendung in eForms-DE Bekanntmachungen finden.
  * Rausgenommen wurden: `BG-715`, `BT-781`, `BT-800`, `BT-779`, `BT-780`, `BT-782` und `BG-716`

#### Geändert

* `BG-61` (Beschreibung): "Mittel der Europäischen Union" statt "der Union"
* `BT-300` (Beschreibung): Hinweis in Zusammenhang mit Regel BR-DE-26 hinzugefügt.
* `BT-503` (Beschreibung): Hinweis hinzugefügt: "Wenn keine Angabe gewünscht ist, kann der Wert 000 eingetragen werden."  
* `BT-503` (Kardinalität): Von Verboten zurück auf EU Vorgaben, um Kompatibilität mit TED zu gewährleisten.  
* `BT-507`,`BT-514`,`BT-5071`,`BT-5141` (Kardinalität): Optional (s. [#30](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/30)).
* `BT-739` (Beschreibung): Satz hinzugefügt: Die Angabe einer Faxnummer ist nicht erwünscht.
* `BT-754` (Name): "Barrierefreiheit" meint die Zugänglichkeit für alle Menschen
* `BT-755` (Name): "Barrierefreiheit - Begründung"
* `BT-06` (Name): "Art der strategischen Beschaffung"
* `BT-06` (Beschreibung): Verweis auf § 10a VgV hinzugefügt
* `BT-105` (Kardinalität): Verpflichtend
* `BG-710` (Kardinalität): Verpflichtend für 4-22 und E2,E3 (s. [#26](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/26))
* `BT-132` (Name): Umbenannt in "Datum der Angebotsöffnung"
* `BT-133` (Name): Umbenannt in "Ort der Angebotsöffnung"
* `BT-737` (Name): Umbenannt in "Unverbindliche Sprachfassung der Vergabeunterlagen"
* `BT-771` (Name): Umbenannt in "Nachforderung von Unterlagen"
* `BT-771` (Beschreibung): "Informationen darüber, ob Unterlagen oder Informationen des Bieters nach Ablauf der Frist nachgefordert werden können", denn Formulierung ist in der VOB/A EU §16a so benannt
* `BT-120` (Name): Umbenannt in "Der Auftraggeber behält sich den Zuschlag auf das Erstangebot vor"
* `BT-766` (Name): Umbenannt in "Angaben zum dynamischen Beschaffungssystem"
* `BT-119` (Name): Umbenannt in "Beendigung des dynamischen Beschaffungssystems"
* `BT-708` (Name): Umbenannt in "Verbindliche Sprachfassung der Vergabeunterlagen"
* `BT-509` (Beschreibung) : Hinweis hinzugefügt
* `BT-633` (Kardinalität): Verboten für 4-6; da TED zur Version 1.7.0 eigenmächtig die Benutzung unterbindet
* `BT-531` (Kardinalität): Verboten für 4-6; da TED zur Version 1.7.0 eigenmächtig die Benutzung unterbindet
* `BT-262` (Kardinalität): Verpflichtend für 38-40; da TED zur Version 1.7.0 eigenmächtig verpflichtend gemacht hat.
* `BG-4` (Beschreibung): Nutzungshinweise hinzugefügt
* `BT-165` (Kardinalität): Verpflichtend für 25-37
* `BG-8`,`BT-195` (Beschreibung) ergänzt um Link zu erlaubten BTs seitens TED (s. [#19](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/19))
* `BT-717` (Kardinalität): Verpflichtend zur Umsetzung des  Saubere-Fahrzeuge-Beschaffungs-Gesetz (s. [#17](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/17))
* `BT-22` (Kardinalität): Verpflichtend da TED dies zur Version 1.7.0 eigenmächtig verpflichtend gemacht hat.
* `BT-505`, `BT-13714`  (Kardinalität): Keine Wiederholbarkeit (s. [#10](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/10))
* `BT-723`, `BT-715`, `BT-716`, `BG-7141`, `BT-717`, `BG-714`, `BT-725` und `BT-735` (Beschreibung): Verweis auf "Saubere-Fahrzeuge-Beschaffungs-Gesetz"  (s. [#36](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/36))
* `BT-67` (Datentyp): "text" zu "code", um die Verwendung einer Codeliste zur Validierung zu verdeutlichen
* `BT-67` (Beschreibung): Datenschutzhinweis entfernt, da durch die Verwendung einer Codeliste die Angabe von Personenbezogenen Daten ausgeschlossen ist
* `BT-740` (Datentyp): "text" zu "code", um die Verwendung einer Codeliste zur Validierung zu verdeutlichen
* `BG-713` (Kardinalität): Verpflichtend, um in jedem Fall Aussagen zur strategischen Beschaffung zu übermitteln.
* Alle BGs und BTs mit Kardinalität `0..0` (Beschreibung): "Benutzung ist unzulässig.", um die Nichtverwendung in Deutschland zu verdeutlichen. (s. [#23](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/23))

### Codelisten (Kapitel 6)

* Es werden nur noch Codelisten dargestellt, die zur Validierung verwendet werden
* Deutsche angepasste Codelisten sind kompatibel mit Version 2023-07-07
* EU Codelisten sind kompatibel mit TED SDK 1.7.0

### Geschäftsregeln (Kapitel 8)

#### Hinzugefügt

* `BR-DE-27`: Nur und nur insofern ein Erfüllungsort (BT-5071) nicht durch NUTS-Codes angegeben werden kann, muss alternativ BT-5141 "Erfüllungsort — Ländercode" angegeben werden. (s. [#30](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/30)).
* `BR-DE-28`: Nur und nur insofern ein Land der Organisation (BT-507) nicht durch NUTS-Codes angegeben werden kann, muss alternativ BT-514 "Land der Organisation" angegeben werden. (s. [#30](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/30)).
* `BR-DE-26`: Benutzung von suitable-business-type codes (s. [#26](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/26))
* `BR-DE-20`: Um abhängig von `BT-06` Aussagen zur strategischen Beschaffung zu erlangen.
* `BR-DE-21`: BT-06 darf nur maximal drei Mal vorkommen
* `BR-DE-22`: "BT-06 darf nur so verwendet werden, dass keiner der verwendeten Codes wiederholt vorkommt."
* `BR-DE-23`: Zuschlagskriterien, deren Gewichtung mindestens 10% muessen ausgeführt werden
* `BR-DE-24`: CVD Daten müssen angegeben werden
* `BR-DE-25`: Nationalität des wirtschaftlichen Eigentümers muss angegeben werden, wenn nicht börsennotiert

### Syntax-Binding (Kapitel 9)

#### Hinzugefügt

* XPath für BT-715, BT-725 und BT-716. (s. [#27](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/27))

#### Rausgenommen

* PIN Profile 1-3 (s. [#29](https://projekte.kosit.org/eforms/eforms-de-specification/-/issues/29))

### Sonstige Änderungen

* Kapitel 2: Hinweis zur Referenzierung auf eingereichte Bekanntmachungen im alten Format aufgenommen
* Kapitel 2: Hinweis "Liste nicht zu veröffentlichender Felder" aufgenommen
* Kapitel 4: Formulierungen zur neutralen Darstellung der von NUTS erfassten Länder
* Kapitel 11: Autorenliste aktualisiert
* Kapitel zu Geschäftsregeln aufgenommen (Kapitel 8)
* Dieses Kapitel zur Änderungshistorie aufgenommen

## Version 1.0.1

* Initiale Version
