/* UI for free color + text matching. Depends on PDF.js & visual.js.
   A visual proposal ALWAYS needs manual GUID review.
*/
(function(scope){
"use strict";
const $=id=>document.getElementById(id);
const V=()=>scope.TrimbleVisual;
const ctx={
  pdf:null,ifc:null,positions:[],image:null,canvas:null,overlay:null,
  page:1,legend:[],calibration:[],mode:"",reversed:false,
  callbacks:null,ready:false,pickingCargo:1,lastRows:[],highlight:null,viewport:null
};
const defaultColors=[
  "#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff",
  "#ff8080","#ff8000","#8000ff","#0080ff","#008f2a"
];
const cargoName=n=>"Vracht "+String(n).padStart(2,"0");
function visualStatus(text,kind="wait"){
  const el=$("visual-status");
  el.textContent=text;el.className="status "+kind;
}
function hint(text){$("legend-hint").textContent=text;}
function selectedPage(){return Number($("visual-page").value)||1;}
function readyToMap(){
  const ok=ctx.ready && ctx.image && ctx.calibration.length===2 &&
    $("legend-verified").checked && ctx.legend.length>0 &&
    ctx.positions.filter(x=>x.type===$("visual-type").value).length>1;
  $("create-visual-rows").disabled=!ok;
  return !!ok;
}
function selectionTypeChoices(){
  const counts=new Map();
  for(const el of ctx.positions){
    counts.set(el.type,(counts.get(el.type)||0)+1);
  }
  const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  const preferred=sorted.find(([type])=>type==="IFCSLAB") ||
    sorted.find(([type])=>type==="IFCELEMENTASSEMBLY") ||
    sorted.find(([type])=>type==="IFCWALL") || sorted[0];
  $("visual-type").replaceChildren();
  for(const [type,count] of sorted){
    const opt=document.createElement("option");
    opt.value=type;opt.textContent=type+" ("+count+")";
    $("visual-type").append(opt);
  }
  if(preferred)$("visual-type").value=preferred[0];
  if(!sorted.length)visualStatus("Geen IFC-objecten met leesbare plaatsingsposities gevonden.","error");
}
function legendRows(){
  const parent=$("legend-rows");
  parent.replaceChildren();
  $("pick-cargo").replaceChildren();
  for(const entry of ctx.legend){
    const row=document.createElement("div");
    row.className="legend-row";
    const title=document.createElement("strong");
    title.textContent="Cargo "+entry.cargo;
    const color=document.createElement("input");
    color.type="color";color.value=entry.color;
    color.setAttribute("aria-label","Kleur van Cargo "+entry.cargo);
    color.addEventListener("input",()=>{
      entry.color=color.value;
      entry.source="handmatig";
      $("legend-verified").checked=false;
      invalidateVisualRows();
      readyToMap();
      renderMarkers();
    });
    const meta=document.createElement("span");
    meta.className="legend-meta";
    meta.textContent=entry.source==="auto"?"Automatisch":entry.source==="handmatig"?"Gecorrigeerd":"Voorbeeld";
    row.append(title,color,meta);
    parent.append(row);
    const opt=document.createElement("option");
    opt.value=entry.cargo;opt.textContent="Cargo "+entry.cargo;
    $("pick-cargo").append(opt);
  }
  $("pick-cargo").value=String(Math.min(ctx.pickingCargo,ctx.legend.length));
  readyToMap();
}
function setLegend(colors,mode) {
  const valid=colors.length>=3;
  ctx.legend=(valid?colors:defaultColors.map((color,i)=>({
    cargo:i+1,color,source:"voorbeeld"
  }))).map((p,i)=>({...p,cargo:i+1,source:valid?"auto":"voorbeeld"})).slice(0,25);
  $("legend-verified").checked=false;
  legendRows();
  hint(valid?
    `${colors.length} kleurstalen gevonden. De namen Cargo 1, 2... zijn voorlopig op verticale volgorde gebaseerd. Controleer de legenda.`
    :"Legenda niet automatisch herkend. Dit zijn VOORBEELDKLEUREN, niet bewezen waarden uit jouw PDF. Klik 'Kies kleur op PDF' om elke kleur over te nemen."
  );
  visualStatus(valid?"Legenda gevonden. Controleer de kleuren en kalibreer het vloerveld.":
    "Legenda niet automatisch gevonden. Selecteer de Cargo-kleuren handmatig op de PDF.","wait");
}
function setMode(newMode){
  ctx.mode=newMode;
  $("pick-swatch").textContent=newMode==="swatch"?"Klik nu op PDF om kleur te kiezen":"Kies kleur op PDF";
  $("calibrate").textContent=newMode==="calibrate"?"Klik nu het midden van de bovenste plaat":"Markeer bovenste + onderste plaat (2 klikken)";
}
function invalidateVisualRows(){
  if(ctx.lastRows.length) {
    ctx.lastRows=[];
    ctx.callbacks?.onRows?.([]);
  }
  $("clear-visual-rows").disabled=true;
  $("add-missing").disabled=true;
}
function renderMarkers(){
  const canvas=ctx.overlay;
  if(!canvas)return;
  const c=canvas.getContext("2d");
  c.clearRect(0,0,canvas.width,canvas.height);
  if(ctx.calibration.length===2){
    c.strokeStyle="#d52917";c.lineWidth=Math.max(2,canvas.width/500);
    c.setLineDash([10,7]);c.beginPath();
    c.moveTo(ctx.calibration[0].x,ctx.calibration[0].y);
    c.lineTo(ctx.calibration[1].x,ctx.calibration[1].y);
    c.stroke();c.setLineDash([]);
  }
  // Candidate markers provide a visual map between PDF and 3D elements.
  if(ctx.lastRows.length){
    const visible=ctx.lastRows.filter(r=>r.page===ctx.page &&
      Number.isFinite(r.pdfPixelX)&&Number.isFinite(r.pdfPixelY));
    c.save();
    for(const row of visible.slice(0,700)){
      c.beginPath();
      c.arc(row.pdfPixelX,row.pdfPixelY,Math.max(3,canvas.width/280),0,Math.PI*2);
      c.lineWidth=1.5;c.strokeStyle="#e05e15";c.fillStyle="#e05e1540";
      c.fill();c.stroke();
    }
    c.restore();
  }
  if(ctx.highlight?.page===ctx.page && Number.isFinite(ctx.highlight.x)){
    const x=ctx.highlight.x,y=ctx.highlight.y;
    c.save();c.strokeStyle="#126bca";c.fillStyle="#126bca40";
    c.lineWidth=Math.max(3,canvas.width/370);
    c.beginPath();c.arc(x,y,Math.max(12,canvas.width/100),0,Math.PI*2);
    c.fill();c.stroke();
    c.beginPath();c.moveTo(x-23,y);c.lineTo(x+23,y);
    c.moveTo(x,y-23);c.lineTo(x,y+23);c.stroke();c.restore();
  }
  ctx.calibration.forEach((pt,i)=>{
    c.beginPath();c.arc(pt.x,pt.y,Math.max(8,canvas.width/155),0,Math.PI*2);
    c.fillStyle="#fff";c.fill();
    c.lineWidth=3;c.strokeStyle="#b91c1c";c.stroke();
    c.fillStyle="#111827";c.font=`bold ${Math.max(13,canvas.width/90)}px sans-serif`;
    c.fillText(i?"Onder":"Boven",pt.x+12,pt.y-12);
  });
}
function clickPoint(event){
  if(!ctx.image)return;
  const r=ctx.overlay.getBoundingClientRect();
  const x=(event.clientX-r.left)*ctx.overlay.width/r.width;
  const y=(event.clientY-r.top)*ctx.overlay.height/r.height;
  if(ctx.mode==="swatch"){
    const color=V().pixel(ctx.image,x,y);
    if(!color||!V().colorful(...color)){
      hint("Klik midden in een duidelijk gekleurd vakje van de legenda, niet op een lijn of tekst.");
      return;
    }
    const cargo=Number($("pick-cargo").value);
    const entry=ctx.legend.find(e=>e.cargo===cargo);
    if(entry){
      entry.color=V().rgbToHex(color);
      entry.source="handmatig";
      $("legend-verified").checked=false;
      invalidateVisualRows();
      legendRows();
      hint(`Cargo ${cargo} kreeg kleur ${entry.color}. Controleer alle legenda-kleuren en vink daarna de bevestiging aan.`);
      readyToMap();
    }
    setMode("");
  }else if(ctx.mode==="calibrate"){
    ctx.calibration.push({x,y});
    renderMarkers();
    if(ctx.calibration.length===1){
      $("calibration-message").textContent="Bovenste plaat gemarkeerd. Klik nu het midden van de ONDERSTE vloerplaat.";
      $("calibrate").textContent="Klik nu de onderste vloerplaat";
    }else if(ctx.calibration.length===2){
      setMode("");
      $("calibration-message").textContent="Bovenste en onderste vloerplaat gemarkeerd. "+
        "Controleer de legenda en klik op 'Maak visuele vrachtvoorstellen'.";
      readyToMap();
    }
  } else if(!ctx.mode && ctx.lastRows.length) {
    // Click a nearby candidate marker to inspect the same GUID in Trimble 3D.
    let nearest=null,distance=Infinity;
    for(const row of ctx.lastRows){
      if(row.page!==ctx.page || !Number.isFinite(row.pdfPixelX))continue;
      const d=Math.hypot(x-row.pdfPixelX,y-row.pdfPixelY);
      if(d<distance){nearest=row;distance=d;}
    }
    if(nearest && distance<Math.max(16,ctx.overlay.width/80)){
      ctx.callbacks?.onInspect?.(nearest);
    }
  }
}
async function showPage(pageNo,{preserveMatches=false}={}){
  if(!ctx.pdf)return;
  if(!preserveMatches)invalidateVisualRows();
  ctx.ready=false;
  ctx.page=pageNo;
  visualStatus("PDF-pagina "+pageNo+" tekenen en kleuranalyse voorbereiden…");
  const page=await ctx.pdf.getPage(pageNo);
  const base=page.getViewport({scale:1});
  // Canvas size capped so very large A0 technical drawings remain responsive.
  const scale=Math.min(2.1,Math.max(.40,1650/Math.max(base.width,base.height)));
  const view=page.getViewport({scale});
  ctx.viewport=view;
  const canvas=$("pdf-canvas");
  canvas.width=Math.floor(view.width);
  canvas.height=Math.floor(view.height);
  const rendering=canvas.getContext("2d",{willReadFrequently:true});
  rendering.fillStyle="#fff";rendering.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:rendering,viewport:view,background:"#ffffff"}).promise;
  page.cleanup();
  ctx.canvas=canvas;
  const overlay=$("pdf-overlay");
  overlay.width=canvas.width;overlay.height=canvas.height;
  ctx.overlay=overlay;
  // A single snapshot kept in memory; neither PDF image nor pixel data leaves the browser.
  ctx.image=rendering.getImageData(0,0,canvas.width,canvas.height);
  ctx.calibration=[];ctx.reversed=false;setMode("");renderMarkers();
  const colors=V().extractLegendColors(ctx.image);
  setLegend(colors,colors.length?"auto":"fallback");
  $("calibration-message").textContent="Markeer het midden van de bovenste en onderste vloerplaat op deze pagina.";
  ctx.ready=true;
  readyToMap();
}
async function openAnalysis({pdfBuffer,ifcBuffer,ifc,onRows,onStatus,onInspect}){
  reset();
  if(!scope.pdfjsLib?.getDocument)throw new Error("PDF.js is niet geladen.");
  ctx.callbacks={onRows,onStatus,onInspect};
  ctx.ifc=ifc;
  ctx.positions=V().parsePlacementCoordinates(ifcBuffer,ifc.elements);
  selectionTypeChoices();
  $("visual-section").hidden=false;
  scope.pdfjsLib.GlobalWorkerOptions.workerSrc=
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  ctx.pdf=await scope.pdfjsLib.getDocument({
    // Independent copy prevents PDF.js worker ownership from detaching the source.
    data:new Uint8Array(pdfBuffer.slice(0)),isEvalSupported:false
  }).promise;
  const pages=$("visual-page");pages.replaceChildren();
  for(let n=1;n<=ctx.pdf.numPages;n++){
    const opt=document.createElement("option");
    opt.value=n;opt.textContent="Pagina "+n;pages.append(opt);
  }
  await showPage(1);
}
function submitProposals(){
  if(!readyToMap())return;
  const type=$("visual-type").value;
  const rows=V().proposeColorAssignments(
    ctx.image,ctx.legend,ctx.positions,{
      top:ctx.calibration[0],bottom:ctx.calibration[1],reversed:ctx.reversed,page:ctx.page
    },{type}
  );
  ctx.lastRows=rows;
  renderMarkers();
  $("clear-visual-rows").disabled=rows.length===0;
  $("add-missing").disabled=false;
  ctx.callbacks?.onRows?.(rows);
  visualStatus(rows.length?
    `${rows.length} visuele vrachtvoorstellen gemaakt. Controleer iedere GUID en vracht in de tabel onderaan.`
    :"Geen platen kregen een eenduidige kleur. Controleer kalibratie, kleurlegenda en IFC-objecttype.",
    rows.length?"ok":"error");
}

async function highlightMatch(row){
  if(!ctx.pdf)return "PDF is niet geladen.";
  const pageNo=Number(row.page||1);
  if(pageNo!==ctx.page && pageNo>=1 && pageNo<=ctx.pdf.numPages){
    $("visual-page").value=String(pageNo);
    await showPage(pageNo,{preserveMatches:true});
  }
  let x=null,y=null;
  if(Number.isFinite(row.pdfPixelX) && Number.isFinite(row.pdfPixelY)){
    x=row.pdfPixelX;y=row.pdfPixelY;
  }else if(Number.isFinite(row.pdfX) && Number.isFinite(row.pdfY) && ctx.viewport){
    const pt=ctx.viewport.convertToViewportPoint(row.pdfX,row.pdfY);
    x=pt[0];y=pt[1];
  }
  ctx.highlight=x!==null ? {x,y,page:pageNo,guid:row.guid} : null;
  renderMarkers();
  if(x!==null){
    const wrap=$("pdf-wrap");
    wrap.scrollIntoView({block:"nearest",behavior:"smooth"});
    return "PDF-locatie blauw omcirkeld op pagina "+pageNo+".";
  }
  return "PDF-pagina "+pageNo+" geopend; voor deze match is geen precieze PDF-positie beschikbaar.";
}

function reset(){
  ctx.image=null;ctx.ready=false;ctx.calibration=[];ctx.positions=[];ctx.lastRows=[];
  ctx.legend=[];ctx.mode="";ctx.reversed=false;ctx.highlight=null;ctx.viewport=null;
  $("visual-section").hidden=true;
  $("legend-verified").checked=false;
  $("create-visual-rows").disabled=true;
  $("clear-visual-rows").disabled=true;
  $("add-missing").disabled=true;
  const image=$("pdf-canvas");
  if(image)image.getContext("2d").clearRect(0,0,image.width,image.height);
  if(ctx.pdf)ctx.pdf.destroy().catch(()=>{});
  ctx.pdf=null;
}
$("pdf-overlay").addEventListener("click",clickPoint);
$("visual-page").addEventListener("change",async()=>{
  try{await showPage(selectedPage());}
  catch(err){visualStatus("PDF-pagina kon niet worden weergegeven: "+err.message,"error");}
});
$("detect-legend").addEventListener("click",()=>{
  if(!ctx.image)return;
  invalidateVisualRows();
  setLegend(V().extractLegendColors(ctx.image),"auto");
});
$("pick-cargo").addEventListener("change",()=>{ctx.pickingCargo=Number($("pick-cargo").value)||1;});
$("pick-swatch").addEventListener("click",()=>setMode("swatch"));
$("calibrate").addEventListener("click",()=>{
  if(!ctx.ready)return;
  invalidateVisualRows();
  ctx.calibration=[];setMode("calibrate");renderMarkers();
  $("calibration-message").textContent="Klik eerst het MIDDEN van de bovenste vloerplaat op de PDF.";
  readyToMap();
});
$("flip").addEventListener("click",()=>{
  invalidateVisualRows();
  ctx.reversed=!ctx.reversed;
  $("calibration-message").textContent=
    "Modelvolgorde "+(ctx.reversed?"omgedraaid":"normaal")+
    ". Bestaande voorstellen opnieuw maken en controleren.";
  readyToMap();
});
$("legend-verified").addEventListener("change",readyToMap);
$("visual-type").addEventListener("change",()=>{invalidateVisualRows();readyToMap();});
$("create-visual-rows").addEventListener("click",submitProposals);
$("add-missing").addEventListener("click",()=>{
  const type=$("visual-type").value;
  const exists=new Set(ctx.lastRows.map(r=>r.guid));
  const missing=ctx.positions.filter(el=>el.type===type && !exists.has(el.guid))
    .map(el=>({
      guid:el.guid,mark:el.mark,ifcMark:el.mark,
      vracht:"",page:ctx.page,confidence:0,
      method:"MANUAL_REQUIRED",status:"needs_review",
      source:"IFC-modelpositie",
      evidence:"Geen betrouwbare kleur gevonden. Vul de vracht zelf in na controle van de tekening. "+
        `IFC positie Y=${Math.round(el.y)}.`
    }));
  ctx.lastRows=[...ctx.lastRows,...missing];
  ctx.callbacks?.onRows?.(ctx.lastRows);
  $("add-missing").disabled=true;
  visualStatus(`${missing.length} ontbrekende ${type}-objecten toegevoegd voor handmatige toewijzing. `+
    "Vul de vracht in en controleer de GUID.", "ok");
});
$("clear-visual-rows").addEventListener("click",()=>{
  ctx.lastRows=[];
  ctx.callbacks?.onRows?.([]);
  $("clear-visual-rows").disabled=true;
  $("add-missing").disabled=true;
  visualStatus("Visuele voorstellen gewist. De tekstmatching blijft behouden.","ok");
});
scope.TrimbleVisualUI={openAnalysis,reset,highlightMatch};
})(typeof window!=="undefined"?window:globalThis);
