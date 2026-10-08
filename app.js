/* Trimble Data Import AI — GitHub Pages / Trimble Workspace API
   Regio is vast EU. Project-ID en rootfolder-ID zijn NIET hetzelfde.
   De app toont alleen bestandsmetadata; IFC/PDF worden niet naar GitHub verstuurd.
*/
"use strict";
const $ = (id) => document.getElementById(id);
const CORE = "https://app21.connect.trimble.com/tc/api/2.0";
const state = {
  api: null,
  project: null,
  rootId: null,
  token: null,
  path: [],
  selected: { ifc: null, pdf: null },
  viewerModels: [],
  activeModel: null,
  analysisRows: [],
  diagnostic: null,
  analyzing: false,
  dataBuffers: null,
  ifcModel: null,
  pdfDoc: null,
  connecting: false,
  loading: false,
  connectFinished: false
};
function note(text) {
  // Schrijf uitsluitend niet-gevoelige informatie.
  const line = `[${new Date().toLocaleTimeString("nl-BE")}] ${String(text)}\n`;
  $("diagnose").textContent += line;
}
function status(text, variant="wait") {
  $("status").textContent = text;
  $("status").className = `status ${variant}`;
}
function safeToken(value) {
  if (value && typeof value === "object") {
    return safeToken(value.data ?? value.accessToken ?? value.token ?? null);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || ["pending", "denied", "granted", "expired"].includes(s.toLowerCase())) return null;
  return s;
}
function apiError(response, payload) {
  const code = payload && typeof payload === "object" ? payload.errorcode : "";
  if (response.status === 403 && code === "USER_NOT_IN_PROJECT") {
    return new Error("Trimble weigert toegang tot dit project (403). Controleer of het actieve project onder jouw Trimble-account toegankelijk is.");
  }
  if (response.status === 401) return new Error("Trimble-toegangstoken verlopen of ongeldig. Klik 'Opnieuw laden'.");
  const reason = (typeof payload === "object" && (payload?.errorcode || payload?.message)) || response.statusText;
  return new Error(`Trimble API HTTP ${response.status}${reason ? ": " + String(reason).slice(0,140) : ""}`);
}
async function readJson(endpoint) {
  if (!state.token) throw new Error("Nog geen toestemming ontvangen van Trimble Connect.");
  let response;
  try {
    response = await fetch(CORE + endpoint, {
      headers: { Authorization: "Bearer " + state.token, Accept: "application/json" },
      cache: "no-store"
    });
  } catch (e) {
    throw new Error("Trimble Core API niet bereikbaar (mogelijk CORS of netwerkverbinding): " + e.message);
  }
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { payload = raw ? { message: "Ongeldig JSON-antwoord" } : {}; }
  if (!response.ok) throw apiError(response, payload);
  return payload;
}
function objectPayload(value) {
  if (value && !Array.isArray(value) && typeof value === "object" && value.data &&
      !Array.isArray(value.data) && typeof value.data === "object") return value.data;
  return value;
}
function rootIdFrom(value) {
  const item = objectPayload(value) || {};
  return item.rootId || item.rootFolderId || item.rootFolderIdentifier ||
    item.rootFolder?.id || item.root?.id || null;
}
async function resolveRootFolder() {
  // Trimble Workspace getProject() bevat doorgaans GEEN rootId.
  const fromWorkspace = rootIdFrom(state.project);
  if (fromWorkspace) return fromWorkspace;
  const projectId = encodeURIComponent(state.project.id);

  // Haal eerst het echte projectobject op; gebruik nooit zomaar projectId als folderId.
  let detailError = null;
  try {
    const details = await readJson("/projects/" + projectId);
    const folderId = rootIdFrom(details);
    if (folderId) return folderId;
    note("Projectgegevens ontvangen, maar er stond geen rootfolder-ID in.");
  } catch (err) {
    detailError = err;
    note("Projectdetails niet beschikbaar: " + err.message);
  }

  // Fallback: vraag projectenlijst in Europa op en zoek EXACT hetzelfde project-ID.
  try {
    const projects = await readJson("/projects?fullyLoaded=true");
    const arr = Array.isArray(projects) ? projects :
      (projects.projects || projects.items || projects.results ||
       (Array.isArray(projects.data) ? projects.data : []));
    const match = arr.find(p => String(p.id || p.projectId) === String(state.project.id));
    const folderId = rootIdFrom(match);
    if (folderId) return folderId;
  } catch (err) {
    note("Projectenlijst niet beschikbaar: " + err.message);
  }
  throw new Error(
    "Kan de rootmap van dit project niet bepalen. " +
    (detailError ? "Projectdetails: " + detailError.message : "Trimble gaf geen rootId terug.") +
    " Open Diagnose voor meer details."
  );
}
function foldersOrFiles(payload) {
  if (Array.isArray(payload)) return payload;
  const data = payload?.items ?? payload?.results ?? payload?.content ?? payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(payload?.folders) || Array.isArray(payload?.files)) {
    return [...(payload.folders || []), ...(payload.files || [])];
  }
  throw new Error("Onverwacht Trimble-bestandsformaat. Bekijk Diagnose.");
}
function itemId(item) {
  return item.id || item.identifier || item.fileId || item.file_id;
}
function itemName(item) {
  return String(item.name || item.fileName || item.filename || item.title || "Naamloos");
}
function isFolder(item) {
  return String(item.type || item.entityType || item.itemType || "").toUpperCase().includes("FOLDER") ||
    item.isFolder === true;
}
function renderPath() {
  const bar = $("breadcrumbs");
  bar.replaceChildren();
  state.path.forEach((entry, index) => {
    const button = document.createElement("button");
    button.textContent = index === 0 ? "Projectroot" : entry.name;
    button.disabled = index === state.path.length - 1;
    button.onclick = () => openFolder(entry.id, entry.name, index);
    bar.append(button);
  });
}
function renderFiles(items) {
  const container = $("files");
  container.replaceChildren();
  const usable = items
    .filter(i => {
      const name = itemName(i);
      return Boolean(itemId(i)) && (isFolder(i) || /\.pdf$/i.test(name));
    })
    .sort((a,b)=> Number(isFolder(b)) - Number(isFolder(a)) ||
      itemName(a).localeCompare(itemName(b), "nl"));
  if (!usable.length) {
    const blank = document.createElement("p");
    blank.className = "placeholder";
    blank.textContent = "Geen mappen, IFC- of PDF-bestanden op dit niveau.";
    container.append(blank);
    return;
  }
  for (const item of usable) {
    const folder = isFolder(item), name = itemName(item);
    const kind = "pdf";
    const row = document.createElement("div");
    row.className = "file-row";
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = (folder ? "📁 " : "📄 ") + name;
    const button = document.createElement("button");
    button.textContent = folder ? "Open map" : "Kies PDF";
    button.onclick = () => {
      if (folder) openFolder(itemId(item),name);
      else {
        state.selected[kind] = { id: itemId(item), name };
        $(`chosen-${kind}`).textContent = name;
        note(kind.toUpperCase() + " geselecteerd: " + name);
        clearAnalysis();
        updateAnalyzeButton();
      
        if (state.selected.ifc && state.selected.pdf) {
          analysisStatus("IFC en PDF geselecteerd. Klik op 'Analyseer geselecteerde bestanden'.","ok");
        }
      }
    };
    row.append(label,button);
    container.append(row);
  }
}
async function openFolder(id, name="Map", existingIndex=-1) {
  if (state.loading) return;
  state.loading = true;
  status("Projectbestanden laden…");
  $("files").textContent = "Bestanden ophalen…";
  try {
    const items = foldersOrFiles(await readJson("/folders/" + encodeURIComponent(id) + "/items"));
    if (existingIndex >= 0) state.path = state.path.slice(0,existingIndex+1);
    else state.path.push({id,name});
    renderPath();
    renderFiles(items);
    status("Kies het viewer-model en een PDF uit dit project", "ok");
    note(`${items.length} items geladen vanuit ${existingIndex === 0 ? "projectroot" : name}.`);
  } catch (err) {
    $("files").textContent = "Bestanden ophalen mislukt: " + err.message;
    status("Bestanden ophalen mislukt", "error");
    note("Folder API: " + err.message);
  } finally { state.loading = false; }
}
async function loadCurrentProjectFiles() {
  if (!state.project || !state.token || state.loading) return;
  status("Rootmap van actief project ophalen…");
  try {
    state.rootId = await resolveRootFolder();
    state.path = [];
    await openFolder(state.rootId,"Projectroot");
  } catch (err) {
    status("Projectbestanden nog niet beschikbaar", "error");
    $("files").textContent = "Bestanden ophalen mislukt: " + err.message;
    note("Rootmap: " + err.message);
  }
}
function workspaceEvent(event, value) {
  if (event !== "extension.accessToken") return;
  const token = safeToken(value);
  if (token) {
    state.token = token;
  
    note("Toegang van Trimble Connect ontvangen (token verborgen).");
    if (state.connectFinished) loadCurrentProjectFiles();
  } else if (String(value?.data ?? value).toLowerCase() === "denied") {
    status("Toegang geweigerd door Trimble Connect", "error");
  }
}
async function start() {
  if (state.connecting) return;
  if (window.self === window.top) {
    status("Open deze app vanuit je Trimble Connect-project", "error");
    $("project-name").textContent = "Geen actieve Trimble-projectsessie";
    $("files").textContent = "Open het icoon Trimble Data Import AI in de 3D-viewer.";
    return;
  }
  if (!window.TrimbleConnectWorkspace?.connect) {
    status("Trimble Workspace API werd niet geladen", "error");
    note("Controleer scripttoegang tot components.connect.trimble.com.");
    return;
  }
  state.connecting = true;
  $("refresh").disabled = true;
  try {
    status("Verbinden met actief Trimble-project…");
    state.api = await window.TrimbleConnectWorkspace.connect(window.parent, workspaceEvent, 30000);
    state.project = await state.api.project.getProject();
    state.selected={ifc:null,pdf:null};
    state.viewerModels=[];
    state.activeModel=null;
    $("chosen-ifc").textContent="Geen viewer-model geselecteerd";
    $("chosen-pdf").textContent="Geen PDF geselecteerd";
    clearAnalysis();
    updateAnalyzeButton();
  
    if (!state.project?.id) throw new Error("Geen project-ID ontvangen vanuit de 3D-viewer.");
    $("project-name").textContent = state.project.name || "(naam niet beschikbaar)";
    note("Actief Trimble-project: " + (state.project.name || "naamloos"));
    $("refresh-models").disabled=false;
    await refreshViewerModels();
    // Verbinding + selectie zijn één doorlopende stap. Geen regioveld of folder-ID nodig.
    const reply = await state.api.extension.requestPermission("accesstoken");
    const token = safeToken(reply);
    if (token) state.token = token;
  
    state.connectFinished = true;
    if (state.token) {
      await loadCurrentProjectFiles();
    } else if (String(reply).toLowerCase() === "denied") {
      status("Geen toestemming: geef de extension toegang via Trimble", "error");
    } else {
      status("Wachten op toestemming voor Trimble-bestanden…");
      note("Accepteer de toegangsaanvraag in Trimble Connect.");
    }
  } catch(err) {
    status("Trimble-verbinding mislukt", "error");
    $("files").textContent = err.message;
    note("Connectiefout: " + err.message);
  } finally {
    state.connecting = false;
    $("refresh").disabled = false;
  }
}

// The loaded 3D viewer supplies the IFC model and version. Project browser supplies only PDF.
async function refreshViewerModels(){
  const dropdown=$("viewer-model");
  dropdown.replaceChildren();
  dropdown.disabled=true;
  state.viewerModels=[];
  const previous=state.activeModel?.versionId||"";
  try{
    $("viewer-model-status").textContent="IFC-modellen in de 3D-viewer ophalen…";
    if(!window.TrimbleViewerModel)throw new Error("viewer-model.js is niet geladen.");
    const models=await window.TrimbleViewerModel.getLoadedIfcModels(state.api);
    state.viewerModels=models;
    if(!models.length){
      const option=document.createElement("option");
      option.value="";
      option.textContent="Geen IFC geladen in de 3D-viewer";
      dropdown.append(option);
      state.activeModel=null;
      state.selected.ifc=null;
      $("chosen-ifc").textContent="Geen geladen IFC-model";
      $("viewer-model-status").textContent=
        "Laad een IFC in de 3D-viewer, klik daarna op 'Vernieuw modellen'.";
      clearAnalysis();updateAnalyzeButton();
      return;
    }
    for(const model of models){
      const option=document.createElement("option");
      option.value=model.versionId;
      option.textContent=model.name+(model.isLatestVersion===false?" (oudere versie)":"");
      dropdown.append(option);
    }
    dropdown.disabled=false;
    const chosen=models.find(m=>m.versionId===previous)||models[0];
    dropdown.value=chosen.versionId;
    await chooseViewerModel(chosen.versionId);
    note(`${models.length} geladen IFC-modellen gevonden in 3D-viewer.`);
  }catch(err){
    $("viewer-model-status").textContent="Kan modellen niet ophalen: "+err.message;
    note("Viewer modellen: "+err.message);
    state.activeModel=null;state.selected.ifc=null;
    $("chosen-ifc").textContent="Viewer-model niet beschikbaar";
    clearAnalysis();updateAnalyzeButton();
  }
}
async function chooseViewerModel(versionId){
  const model=state.viewerModels.find(m=>m.versionId===versionId);
  if(!model)return;
  state.activeModel=model;
  state.selected.ifc=null;
  clearAnalysis();updateAnalyzeButton();
  $("chosen-ifc").textContent=model.name+" (viewer-versie)";
  $("viewer-model-status").textContent="Bronbestand voor dit geladen model vaststellen…";
  try{
    const selectedFile=await window.TrimbleViewerModel.sourceFile(state.api,model);
    // Protect against accidental current-vs-old version mismatch.
    if(selectedFile.versionId!==model.versionId)throw new Error("De IFC-versie klopt niet met de viewer.");
    state.selected.ifc=selectedFile;
    $("viewer-model-status").textContent="Model geladen: "+model.name+
      (selectedFile.warning ? " (bestandsmetadata niet volledig bevestigd)" : "");
    if(selectedFile.warning)note("Viewer modelbron: "+selectedFile.warning);
    updateAnalyzeButton();
    if(state.selected.pdf)analysisStatus("Viewer-model en PDF geselecteerd. Klik op Analyseer.","ok");
  }catch(err){
    state.selected.ifc=null;
    $("viewer-model-status").textContent="Kon bronbestand niet bepalen: "+err.message;
    analysisStatus("Selecteer een ander viewer-model of vernieuw de modelweergave.","error");
    note("Modelbron: "+err.message);
  }
}

async function inspectMatchFromPdf(row){
  const index=state.analysisRows.findIndex(r=>
    r.guid===row.guid && (r.vracht===row.vracht || row.method==="MANUAL_REQUIRED"));
  if(index<0){
    analysisStatus("De geselecteerde PDF-markering is niet meer in de controletabel te vinden.","error");
    return;
  }
  const tr=$("match-rows").children[index];
  const button=tr?.querySelector("td.visual-check button");
  if(button)await focusMatch(state.analysisRows[index],tr,button);
}

async function focusMatch(row,tr,button){
  if(!state.activeModel){
    analysisStatus("Er is geen IFC-model geselecteerd in de 3D-viewer.","error");
    return;
  }
  if(!row.guid){
    analysisStatus("Deze regel heeft nog geen gekoppelde GUID.","error");
    return;
  }
  const oldText=button.textContent;
  button.disabled=true;button.textContent="Selecteren…";
  try{
    const result=await window.TrimbleViewerModel.locateObject(state.api,state.activeModel,row.guid);
    document.querySelectorAll("#match-rows tr.selected-match").forEach(e=>e.classList.remove("selected-match"));
    tr.classList.add("selected-match");
    let pdfHint="";
    if(window.TrimbleVisualUI?.highlightMatch){
      try{
        pdfHint=await window.TrimbleVisualUI.highlightMatch(row);
      }catch(e){
        pdfHint="PDF-markering niet beschikbaar: "+e.message;
      }
    }
    const message="GUID geselecteerd in Trimble 3D-viewer."+
      (result.fitted?" Camera ingezoomd.":"")+
      (pdfHint?" "+pdfHint:"")+(result.warning?" "+result.warning:"");
    analysisStatus(message,"ok");
  }catch(err){
    analysisStatus("Kan object niet tonen in 3D: "+err.message,"error");
    note("Bekijk 3D: "+err.message);
  }finally{button.disabled=false;button.textContent=oldText;}
}
$("viewer-model").addEventListener("change",event=>chooseViewerModel(event.target.value));
$("refresh-models").addEventListener("click",refreshViewerModels);

$("refresh").addEventListener("click", () => {
  // Gebruik na verbinding het bestaande (actieve) project; token kan door Trimble vernieuwd worden.
  if (state.project && state.token) {
    state.path = [];
    refreshViewerModels();
    loadCurrentProjectFiles();
  } else start();
});
window.addEventListener("load", start);


/* Fase 2: download de twee geselecteerde Trimble-bestanden naar browsergeheugen. */
const MAX_BYTES = 180 * 1024 * 1024; // 180 MB voorzichtigheidslimiet voor browserverwerking

function analysisStatus(text, variant="wait") {
  const element=$("analysis-status");
  element.textContent=text;
  element.className=`status ${variant}`;
}
function updateAnalyzeButton() {
  $("analyze").disabled = !(state.selected.ifc && state.selected.pdf && state.token) || state.analyzing;
}
function clearAnalysis() {
  state.analysisRows=[];
  state.diagnostic=null;
  state.dataBuffers=null;
  state.ifcModel=null;
  window.TrimbleVisualUI?.reset();
  $("no-results").hidden=false;

  $("analysis-details").hidden=true;
  $("analysis-details").replaceChildren();
  $("export").disabled=true;
  $("review").hidden=true;
  $("stats").hidden=true;
  $("match-rows").replaceChildren();
  analysisStatus("Selecteer IFC en PDF om de analyse te starten.");
}
function extractDownloadUrl(payload) {
  if (typeof payload==="string") return payload;
  if (!payload || typeof payload!=="object") return null;
  const links=[
    payload.url,payload.downloadUrl,payload.downloadURL,payload.href,
    payload.link,payload.signedUrl,payload.location,
    payload.data?.url,payload.data?.downloadUrl,
    payload.result?.url,payload.result?.downloadUrl
  ];
  return links.find(x=>typeof x==="string" && /^https:\/\//i.test(x)) || null;
}
async function downloadFromTrimble(selection) {
  const path="/files/fs/"+encodeURIComponent(selection.id)+"/downloadurl";
  const payload=await readJson(path);
  const signedUrl=extractDownloadUrl(payload);
  if (!signedUrl) {
    const keys=payload&&typeof payload==="object"?Object.keys(payload).join(", "):"onbekend";
    throw new Error("Trimble gaf geen herkenbare download-URL terug voor "+
      selection.name+". Responsvelden: "+keys+".");
  }
  // Nooit het Trimble bearer token meesturen naar de tijdelijke download-URL.
  let response;
  try {
    response=await fetch(signedUrl,{method:"GET",credentials:"omit",cache:"no-store"});
  } catch (e) {
    throw new Error("Het downloaden van "+selection.name+" is geblokkeerd. "+
      "Mogelijk staat de tijdelijke Trimble-downloadlocatie geen CORS toe in GitHub Pages. "+
      "Details: "+e.message);
  }
  if (!response.ok) throw new Error("Bestand downloaden mislukt: HTTP "+response.status+
    " ("+selection.name+").");
  const length=Number(response.headers.get("content-length")||0);
  if (length>MAX_BYTES) throw new Error(selection.name+" is groter dan 180 MB. "+
    "Voor deze omvang is een andere verwerkingsmethode nodig.");
  const buffer=await response.arrayBuffer();
  if (buffer.byteLength>MAX_BYTES) throw new Error(selection.name+
    " is groter dan 180 MB voor deze browsertest.");
  return buffer;
}
function addTextCell(tr,content,cls) {
  const td=document.createElement("td");
  td.textContent=String(content??"");
  if (cls) td.className=cls;
  tr.append(td);
  return td;
}
function renderReview() {
  const tbody=$("match-rows");
  tbody.replaceChildren();
  for (const row of state.analysisRows) {
    const tr=document.createElement("tr");
    if (row.status==="needs_review" || !row.guid ||
        row.method==="DUPLICATE_MARK_REVIEW" || row.method==="CONFLICT") {
      tr.className="review-needed";
    }
    const markCell=addTextCell(tr,row.mark);
    markCell.title=row.evidence||"";
    const ifcCell=addTextCell(tr,row.ifcMark);
    ifcCell.title="Bron IFC-identificatie: "+(row.source||"Onbekend");
    addTextCell(tr,row.guid,"guid");
    const vrachtTd=document.createElement("td");
    const vrachtInput=document.createElement("input");
    vrachtInput.value=row.vracht;
    vrachtInput.setAttribute("aria-label","Vracht voor "+row.ifcMark);
    vrachtInput.addEventListener("change",()=>{
      row.vracht=vrachtInput.value.trim();
      if (row.status==="confirmed") row.status="needs_review";
    });
    vrachtTd.append(vrachtInput);
    tr.append(vrachtTd);
    addTextCell(tr,row.page);
    addTextCell(tr,row.method+" · "+row.confidence+"%");
    const td=document.createElement("td");
    const select=document.createElement("select");
    select.setAttribute("aria-label","Beslissing voor "+row.ifcMark);
    for (const [value,label] of [
      ["proposed","Voorstel"],
      ["confirmed","Bevestigd"],
      ["needs_review","Controle nodig"],
      ["rejected","Afgewezen"]
    ]) {
      const option=document.createElement("option");
      option.value=value;option.textContent=label;select.append(option);
    }
    select.value=row.status;
    select.addEventListener("change",()=>row.status=select.value);
    td.append(select);tr.append(td);
    const visualTd=document.createElement("td");
    visualTd.className="visual-check";
    if (row.guid) {
      const focusButton=document.createElement("button");
      focusButton.type="button";
      focusButton.className="secondary";
      focusButton.textContent="Bekijk in 3D + PDF";
      focusButton.title="Selecteer dit object in Trimble en markeer de bronpositie op de PDF.";
      focusButton.onclick=()=>focusMatch(row,tr,focusButton);
      visualTd.append(focusButton);
    } else {
      visualTd.textContent="Geen GUID gekoppeld";
    }
    tr.append(visualTd);
    tbody.append(tr);
  }
  $("review").hidden=false;
  $("export").disabled=false;
}
function onVisualRows(visualRows) {
  state.analysisRows=state.analysisRows.filter(r=>r.method!=="VISUAL_POSITION_REVIEW" && r.method!=="MANUAL_REQUIRED");
  let conflicts=0;
  for (const row of visualRows) {
    const matching=state.analysisRows.filter(r=>r.guid===row.guid);
    const same=matching.find(r=>r.vracht===row.vracht);
    if (same) {
      // Preserve stronger exact text match while noting independent color evidence.
      same.evidence=(same.evidence||"")+
        " | Visuele kleur/positie bevestigt deze vracht (positie nog controleren).";
      continue;
    }
    if (matching.some(r=>r.vracht && r.vracht!==row.vracht)){
      row.method="VISUAL_POSITION_REVIEW";row.status="needs_review";
      row.confidence=0;
      row.evidence += " | LET OP: tekstmatching noemt een andere vracht!";
      conflicts++;
      for(const old of matching){old.status="needs_review";old.confidence=0;}
    }
    state.analysisRows.push(row);
  }
  if(state.analysisRows.length){
    renderReview();
    $("no-results").hidden=true;
  }else{
    $("review").hidden=true;
    $("export").disabled=true;
    $("no-results").hidden=false;
  }
  $("stats").textContent=($("stats").textContent.split(" · visueel:")[0]||"Analyse")+
    ` · visueel: ${visualRows.length} voorstellen`+
    (conflicts?` · ${conflicts} conflicten`:"");
  $("stats").hidden=false;
  note(`Visuele voorstellen: ${visualRows.length}; tegenstrijdigheden: ${conflicts}.`);
}

async function analyzeSelected() {
  if (!state.selected.ifc || !state.selected.pdf || !state.token) {
    analysisStatus("Selecteer eerst een IFC en een PDF.","error");
    return;
  }
  if (!window.TrimbleAnalysis) {
    analysisStatus("De analysebibliotheek is niet geladen. Controleer analysis.js.","error");
    return;
  }
  state.analyzing=true;
  updateAnalyzeButton();
  $("export").disabled=true;
  $("review").hidden=true;
  $("stats").hidden=true;
  try {
    if (!state.activeModel || state.selected.ifc?.versionId!==state.activeModel.versionId) {
      throw new Error("De IFC-keuze komt niet overeen met het geladen viewer-model. Vernieuw de modellenlijst.");
    }
    analysisStatus("IFC-bron van geladen 3D-model downloaden…");
    const ifcBuffer=await downloadFromTrimble(state.selected.ifc);
    analysisStatus("PDF downloaden uit Trimble Connect…");
    const pdfBuffer=await downloadFromTrimble(state.selected.pdf);
    analysisStatus("IFC-elementen en GUID's uitlezen…");
    window.TrimbleVisualUI?.reset();
    const ifc=window.TrimbleAnalysis.parseIfc(ifcBuffer);
    if (!ifc.elements.length) throw new Error(
      "Geen herkende IFC-elementen met GUID gevonden. Het IFC-bestand bevat mogelijk een onverwacht elementtype.");
    analysisStatus("PDF-tekst en vrachtindeling uitlezen…");
    const pages=await window.TrimbleAnalysis.extractPdfPages(pdfBuffer,window.pdfjsLib);
    const chars=pages.reduce((sum,p)=>sum+p.lines.join(" ").length,0);
    if (chars<15) note("PDF bevat vrijwel geen tekstlaag. De visuele kleurherkenning blijft beschikbaar.");
    analysisStatus("PDF-vrachtgegevens koppelen aan IFC-elementen…");
    const result=window.TrimbleAnalysis.analyzeDocument(pages,ifc);
    state.diagnostic=result.diagnostic;
    renderAnalysisDetails(result.diagnostic);
    state.analysisRows=result.rows;
    state.ifcModel=ifc;
    $("stats").textContent=`${ifc.elements.length} IFC-objecten · `+
      `${result.markedElements} objecten met identificatie · `+
      `${pages.length} PDF-pagina's · `+
      `${result.rows.length} matchvoorstellen · `+
      `${result.diagnostic.detectedVrachten.length} vrachtlabels herkend`;
    $("stats").hidden=false;
    if (result.rows.length) {
      renderReview();
      $("no-results").hidden=true;
    } else {
      $("no-results").textContent="Nog geen tekstmatches. Gebruik hieronder de kleurenlegenda en de posities van de vloerplaten.";
    }
    analysisStatus("Bestanden gelezen. Controleer nu de kleurenlegenda en markeer het vloerplan hieronder.","ok");
    if (window.TrimbleVisualUI?.openAnalysis) {
      await window.TrimbleVisualUI.openAnalysis({
        pdfBuffer,ifcBuffer,ifc,
        onRows:onVisualRows,
        onInspect:inspectMatchFromPdf
      });
    } else {
      note("Visuele module niet gevonden: visual.js of visual-ui.js ontbreekt.");
    }
    note(`Analyse uitgevoerd: ${ifc.elements.length} IFC-elementen; `+
      `${pages.length} PDF-pagina's; ${result.rows.length} voorstellen.`);
  } catch(err) {
    analysisStatus("Analyse mislukt: "+err.message,"error");
    note("Analysefout: "+err.message);
  } finally {
    state.analyzing=false;
    updateAnalyzeButton();
  }
}
function exportCsv() {
  if (!state.analysisRows.length) return;
  const csv=window.TrimbleAnalysis.csv(
    state.analysisRows,
    state.project?.name||"",
    state.selected.ifc?.name||"",
    state.selected.pdf?.name||""
  );
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=url;
  a.download="Trimble-Data-Import-AI-analyse.csv";
  document.body.append(a);
  a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$("analyze").addEventListener("click",analyzeSelected);
$("export").addEventListener("click",exportCsv);
$("confirm-unique").addEventListener("click",()=>{
  let number=0;
  for (const row of state.analysisRows) {
    if ((row.method==="EXACT_MARK" || row.method==="AI_VISUAL_EXACT_MARK") &&
        row.status==="proposed" && row.guid) {
      row.status="confirmed";number++;
    }
  }
  renderReview();
  analysisStatus(number+" unieke voorstellen bevestigd. Controleer de overige matches.","ok");
});


function renderAnalysisDetails(info) {
  const container=$("analysis-details");
  container.replaceChildren();
  const heading=document.createElement("h3");
  heading.textContent="Wat heeft de analyse gevonden?";
  container.append(heading);
  function segment(title,lines){
    const section=document.createElement("section");
    section.className="diagnostic-segment";
    const h=document.createElement("h4");
    h.textContent=title;section.append(h);
    const pre=document.createElement("pre");
    pre.textContent=lines.join("\n") || "(geen gegevens herkend)";
    section.append(pre);
    container.append(section);
  }
  segment("Samenvatting",[
    `IFC-markeringen geïndexeerd: ${info.aliasCount}`,
    `IFC-objecten met identificatie: ${info.elementsWithAliases}`,
    `PDF-tekens: ${info.textCharacters}`,
    `PDF-regels: ${info.linesSeen}`,
    `Gevonden vrachtlabels: ${info.detectedVrachten.join(", ")||"geen"}`,
    `Elementvermeldingen met ontbrekende vrachtcontext: ${info.noTruck}`
  ]);
  segment("Voorbeelden van IFC-identificaties",
    info.ifcAliases.slice(0,18).map(e=>`${e.type}: ${e.mark}`));
  segment("Eigenschappennamen in de IFC",
    info.propertyNames.slice(0,30).map(([name,count])=>`${name} (${count}×)`));
  segment("PDF-tekst zoals de browser deze leest",
    info.pdfPreview.slice(0,24).map(x=>`Pagina ${x.page}: ${x.line}`));
  const note=document.createElement("p");
  note.className="muted";
  note.textContent="Deze voorbeelden worden alleen in je browser getoond. "+
     "Ze worden niet naar GitHub gestuurd. De diagnose helpt ons bepalen welke herkenningsregels ontbreken.";
  container.append(note);
  container.hidden=false;
}


