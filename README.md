# Trimble Data Import AI — V6 gratis hybride analyse

**Zonder Render, zonder OpenAI/Gemini API, zonder betalende server.**
De bestanden blijven in Trimble Connect. De extensie gebruikt je actieve project en analyseert lokaal in de browser.

## Wat V6 kan

1. Het actieve Europese Trimble-project herkennen.
2. IFC en PDF rechtstreeks uit de projectmappen selecteren.
3. IFC-tekst en Property Sets lezen; elementnummers en GUID's identificeren.
4. PDF-tekst uitlezen (PDF.js).
5. De PDF **als gekleurd beeld** tonen en kleurstalen uit een verticale legenda herkennen.
6. De herkende legenda toont `Cargo 1` t/m `Cargo N`, met aanpasbare kleuren.
7. Posities van IFC-objecten lezen uit `IfcLocalPlacement`.
8. Na twee door jou aangeduide referentiepunten op de PDF, per vloerplaat een vrachtvoorstel maken op basis van de IFC-plaatsingsvolgorde en de kleur onder het voorspelde punt.
9. Een tabel tonen met GUID, identificatie, vracht, matchmethode en status.
10. Ontbrekende IFC-objecten toevoegen om handmatig aan een vracht te koppelen.
11. Controleresultaten als **CSV voor Excel** bewaren.

## Hoe je ermee werkt

1. Installeer de ZIP-bestanden in de root van je bestaande repo `jonasvanhecke-98/Trimble-data-import-AI-v2`.
2. Wacht tot GitHub Pages bijgewerkt is; open daarna Trimble Connect 3D-viewer en herlaad (Ctrl+F5).
3. Open de extensie. Je actieve project verschijnt automatisch.
4. Kies IFC + vrachtplanning-PDF en klik **Analyseer IFC + PDF**.
5. In de sectie **Kleurlegenda en vloerplaten** zie je een afbeelding van de PDF.
6. Controleer Cargo-kleuren met de werkelijke legenda; pas desnoods afzonderlijke kleurstalen aan via het kleurvakje of via `Kies kleur op PDF`.
7. Vink **Ik heb de kleuren met de legenda in mijn PDF vergeleken** aan.
8. Controleer bij `IFC-objecttype` of je bijvoorbeeld **IFCSLAB** (vloerplaat) geselecteerd hebt.
9. Klik **Markeer bovenste + onderste plaat (2 klikken)**. Klik op de PDF het MIDDEN van de bovenste plaat en daarna het MIDDEN van de onderste plaat.
10. Klik **Maak visuele vrachtvoorstellen**.
11. Onder **Controleer de vrachttoewijzingen** zie je de kandidaat-GUID's en vrachten. Corrigeer indien nodig en verander `Controle nodig` naar `Bevestigd`.
12. Met **Toon overige vloerplaten voor handmatige toewijzing** voeg je objecten toe die zonder duidelijke kleur werden overgeslagen.
13. Klik **Download CSV voor Excel**; bewaar dit bestand op je pc.

## Getest op de aangeleverde Nerva-vrachtplanning

Met de originele PDF en bijbehorende IFC in een offline proef:
- 11 kleurstalen (Cargo 1 tot en met Cargo 11) werden herkend.
- 56 IFC-vloerplaten met afzonderlijke GUID/plaatsingsposities gevonden.
- Een voorbeeldkalibratie leverde 53 kleurvoorstellen op.
**Dit bewijst niet dat alle 53 toewijzingen correct zijn!** Een andere kalibratie kan andere uitkomsten geven.
Bij speciale platen, afwijkende oriëntatie of verkeerde plaatsingsvolgorde moet jij corrigeren.

## Belangrijke beperkingen

- Dit is **geen ChatGPT-achtig multimodaal AI-model**. Het is gratis, regelgebaseerde PDF-kleurherkenning gecombineerd met IFC-tekst en plaatsen.
- De kleurenlegenda wordt automatisch geïnterpreteerd volgens de verticale volgorde. Als de legenda niet zo is opgebouwd, corrigeer de kleuren.
- De IFC-positie gebruikt plaatsingspunten/vertalingen, **niet** de exacte geometrische contour of rotaties. De twee referentiepunten zijn een benadering; verwissel de richting indien nodig via `Draai modelvolgorde om`.
- Visueel afgeleide vrachtregels hebben altijd `Controle nodig` en maximaal 65% heuristische score. Bevestig handmatig!
- Gescande PDF's zonder tekstlaag kunnen wel kleurinformatie leveren, maar geen betrouwbaar OCR-tekstresultaat.
- Grote PDF/IFC kunnen het browsergeheugen overbelasten. Er geldt een limiet van ongeveer 180 MB per bestand.
- Downloads uit Trimble kunnen door browser-CORS worden geblokkeerd als Trimble of de tijdelijke bestandslocatie die toegang niet toestaat.
- **Het schrijven naar Trimble Custom Property Sets is nog NIET geïmplementeerd**. De knop blijft daarom bewust uitgeschakeld.
- De resultaten worden alleen in browsergeheugen bewaard en gaan verloren als je de extensie sluit zonder CSV te downloaden.

## Wat staat er in het pakket?

- `index.html`: extensie-UI.
- `style.css`: opmaak.
- `app.js`: Trimble Workspace + Core API + download + analysetabel.
- `analysis.js`: IFC Property Sets en PDF-tekstanalyse.
- `visual.js`: PDF-kleuren, legenda, IFC-plaatsing en ruimtelijke kleurvoorstellen.
- `visual-ui.js`: interactieve PDF/legenda/kalibratie.
- `manifest.json`, `icon.svg`: registratie van extensie, bestaande URL.
- `README.md`: dit bestand.

De manifest-URL blijft:
https://jonasvanhecke-98.github.io/Trimble-data-import-AI-v2/manifest.json

## Oude V5-bestanden

`requirements-ai.txt`, `scripts/`, `.github/workflows/visuele-ai-analyse.yml`, `WORKFLOW-KOPIEER.txt` en `tests/` uit V5 worden niet gebruikt.
Je hoeft de betaalde AI-workflow niet te starten. Je kunt deze overbodige bestanden later verwijderen.

## Privacy

Zet NOOIT toegangstokens, OpenAI-API-sleutels of klant-IFC/PDF's in een publieke GitHub-repository.
Deze app leest Trimble-bestanden lokaal in je browser, maar laadt de officiële Trimble Workspace API en PDF.js
vanaf externe JavaScript-CDN's. Gebruik de app alleen voor projecten waarvan je gegevens mag verwerken.

## Verder uit te bouwen

- Veilige Property Set API-schrijfacties op basis van bevestigde GUID's.
- Revisions-/auditlog.
- 3D-viewer focus.
- Betere echte 2D/3D-geometrieregistratie bij dubbelzinnige posities.
