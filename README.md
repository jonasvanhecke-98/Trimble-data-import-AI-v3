# Trimble Data Import AI — V7: 3D-viewer model + PDF + visuele controle

## Wat is nieuw

**Je hoeft geen IFC meer uit de Trimble-bestandenbrowser te kiezen.**

1. Open Trimble Connect **3D-viewer** en laad het gewenste IFC-model.
2. Start de extension **Trimble Data Import AI**.
3. De extension vraagt de **geladen IFC-modellen** uit de viewer op via de officiële Workspace API.
   - Bij één model wordt dat automatisch geselecteerd.
   - Bij meerdere geladen IFC-modellen kies je in een keuzelijst.
4. Kies **alleen de PDF** uit de projectmappen van hetzelfde Trimble-project.
5. Klik **Analyseer viewer-model + PDF**.
6. De tool haalt de bron-IFC van de gekozen geladen modelversie op, leest IFC-eigenschappen en PDF-tekst en biedt kleurherkenning.
7. Bij de matchvoorstellen: klik **Bekijk in 3D + PDF**. Het corresponderende object wordt in Trimble geselecteerd en de PDF-locatie verschijnt met blauwe markering als die uit de analyse bekend is.
8. Na kalibratie met de kleurenlegenda worden visuele kandidaatposities oranje in de PDF getoond; je kunt een kandidaatmarker aanklikken om hetzelfde object in 3D te controleren.
9. Voorstellen blijven ter goedkeuring in de controletabel. Download desgewenst een Excel-compatibele CSV.

## Fix
De oude fout `Cannot perform Construct on a detached ArrayBuffer` is opgelost door de oorspronkelijke PDF-buffer niet rechtstreeks aan de PDF.js-worker over te dragen. Iedere PDF.js-sessie ontvangt nu een onafhankelijke kopie.

## Installatie in V3 GitHub-repository
1. Download ZIP en pak uit.
2. Upload alle bestanden uit de ZIP rechtstreeks naar de root van `jonasvanhecke-98/Trimble-data-import-AI-v3`. Vervang gelijknamige bestanden.
3. Wacht op publicatie van GitHub Pages.
4. Open de bestaande Trimble extension opnieuw en vernieuw eventueel de viewer met Ctrl+F5.
5. De oude manifest-URL blijft ongewijzigd:
   `https://jonasvanhecke-98.github.io/Trimble-data-import-AI-v3/manifest.json`

## Bestandsoverzicht
- `index.html` — UI
- `app.js` — Trimble Core API / projectbrowser / analyse & review
- `viewer-model.js` — selectie van geladen IFC-modellen en GUID-focus via officiële Viewer API
- `analysis.js` — IFC-Pset en PDF-tekstmatching, bufferfix
- `visual.js` — gratis PDF-kleurdetectie en IFC-positievoorstellen
- `visual-ui.js` — PDF-weergave, markeringen, kalibratie, aanklikbare kandidaten
- `style.css`, `manifest.json`, `icon.svg`, `README.md`

## Eerlijke beperkingen

- De browser gebruikt geen generatief AI-model. De kleurenlegenda, PDF-tekst en geometrische positie vormen benaderende matches, geen garantie.
- Onzekere visuele matches krijgen de status **Controle nodig**. Bevestig pas nadat je ze in PDF en 3D gecontroleerd hebt.
- Het PDF ↔ 3D-highlight werkt alleen betrouwbaar als de GUID in de gekozen modelversie voorkomt en de viewer die GUID kan omzetten naar een runtime object-ID.
- Viewer `getLoadedModel()` moet voldoende informatie teruggeven om het bronbestand veilig te identificeren. Als dat ontbreekt, wordt voor een huidige modelversie de `ModelSpec.id` als file-ID gebruikt; controleer dan altijd dat het juiste model in de viewer geladen is.
- Viewer `convertToObjectRuntimeIds()` en `setSelection()` kunnen bij sommige objecten weigeren; dat wordt in de UI vermeld en wijzigt niets aan het model.
- Voor tekstmatches verschijnt een precieze PDF-markering alleen als een herkenbare tekstpositie beschikbaar is; voor visuele matches alleen na kleurherkenning/kalibratie.
- Grootschalige IFC-analyses kunnen traag zijn of veel geheugen gebruiken.
- De daadwerkelijke Trimble **Custom Property Set API** is **nog niet geactiveerd**. De tool voert geen eigenschapswijzigingen uit.
- PDF en IFC worden tijdelijk naar het browsergeheugen geladen en **niet** naar GitHub gestuurd.
- Geen Render, geen OpenAI/Gemini API-key en geen betalende AI-dienst nodig.
- De Workspace API en PDF.js laden van externe JavaScript-CDN's; als Trimble/browser die blokkeert, wordt de bibliotheek niet gestart.

## Documentatie
- https://components.connect.trimble.com/trimble-connect-workspace-api/interfaces/ViewerAPI.html
- https://components.connect.trimble.com/trimble-connect-workspace-api/interfaces/ModelSpec.html

## Technische tests
- `node --check` voor alle JS-bestanden.
- Tests met mock-Workspace API: geladen IFC-model en bronversie selecteren, IFC GUID expanderen,
  object in 3D selecteren en camera instellen, PDF.js-bufferoverdracht en Cargo/herkenning.
- Werkelijke Trimble-tenant en echte live PDF rendering zijn niet vanuit deze bouwomgeving gevalideerd.
