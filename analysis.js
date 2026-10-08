/* Trimble Data Import AI V4 - traceable local browser analysis.
   IFC STEP and PDF text are processed in-browser, no server/uploads.
   Statistical/generative AI and scanned PDF OCR are NOT included.
*/
(function(scope){
"use strict";
const MARK_KEY_RE=/(?:^|[^a-z])(mark|mer[kc]|element(?:nummer|nr|number|no|id|code|naam|name)?|onderdeel(?:nummer|nr)?|assembly|castunit|piece|part|panel|plaat|positie|position|reference|referentie|ref|stuk(?:nummer|nr)?|id(?:entificatie)?|code|nummer|number|prefab|product|type(?:mark|number)?)(?:$|[^a-z])/i;
const BAD_PROP_RE=/(?:^|[^a-z])(height|width|length|thickness|volume|area|weight|mass|fire|thermal|density|cost|rebar|color|colour|material|strength|latitude|longitude|date|status|building|storey|level)(?:$|[^a-z])/i;
const OBJECT_RE=/^IFC(?:ELEMENTASSEMBLY|BUILDINGELEMENTPROXY|BUILTELEMENT|WALL|SLAB|BEAM|COLUMN|MEMBER|PLATE|DOOR|WINDOW|CURTAINWALL|STAIR|ROOF|FOOTING|PILE|RAILING|COVERING|REINFORCING|FLOW|DISTRIBUTION|PIPE|DUCT|CABLE|PROXY|FURNISHING|RAMP|CHIMNEY|SHADING|TENDON|FASTENER|MECHANICALFASTENER|DISCRETEACCESSORY|VIBRATIONISOLATOR|TRANSPORTELEMENT|GEOGRAPHICELEMENT|PAVEMENT|KERB|BRIDGE|RAIL|TRACK|SIGNAL|LIGHTFIXTURE|SOLARELEMENT|CIVILELEMENT|EARTHWORKSELEMENT|DEEPFOUNDATION|BURNER|SANITARYTERMINAL|AIRTERMINAL|ELECTRICAPPLIANCE|ELECTRICDISTRIBUTIONBOARD|ELECTRICFLOWSTORAGEDEVICE|CONTROLLER|SENSOR|ACTUATOR|TERMINAL|VALVE|PUMP|FAN|BOILER|TANK|CHILLER|FILTER|HEATEXCHANGER|JUNCTIONBOX|SWITCHINGDEVICE|OUTLET|CABLECARRIER|CABLESEGMENT|PIPESEGMENT|PIPEFITTING|DUCTSEGMENT|DUCTFITTING|FLOWSEGMENT|FLOWFITTING|OPENINGELEMENT|FEATUREELEMENT|SURFACEFEATURE|VOIDINGFEATURE)/;
const norm = value => String(value??"").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9]/g,"");
const tokenize = text => (String(text||"").match(/[\p{L}\p{N}]+/gu)||[]).map(norm).filter(Boolean);
function splitArgs(text) {
  const result=[]; let start=0,depth=0,quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==="'"){if(quoted && text[i+1]==="'"){i++;continue;}quoted=!quoted;}
    else if(!quoted && c==="(")depth++;
    else if(!quoted && c===")")depth--;
    else if(!quoted && depth===0 && c===","){result.push(text.slice(start,i).trim());start=i+1;}
  }
  result.push(text.slice(start).trim());return result;
}
function endArgs(text,start) {
  let depth=1,quoted=false;
  for(let i=start;i<text.length;i++){
    const c=text[i];
    if(c==="'"){if(quoted&&text[i+1]==="'"){i++;continue;}quoted=!quoted;}
    else if(!quoted&&c==="(")depth++;
    else if(!quoted&&c===")"&&--depth===0)return i;
  }
  return -1;
}
function value(raw){
  const s=String(raw||"").trim();
  if(!s||s==="$"||s==="*")return "";
  if(s.startsWith("'")&&s.endsWith("'"))return s.slice(1,-1).replace(/''/g,"'");
  const typed=/^IFC[A-Z0-9_]+\s*\((.*)\)$/is.exec(s);
  if(typed)return value(typed[1]);
  return s;
}
const refs = s => [...String(s||"").matchAll(/#(\d+)/g)].map(m=>+m[1]);
function looksLikeMark(s,source=""){
  s=String(s||"").trim();
  if(!s || s.length>100 || !/\d/.test(s))return false; // Beschrijvende namen zijn geen element-ID's.
  if(/[=\r\n{}]/.test(s) || /^https?:/i.test(s))return false;
  if(/^\d{1,2}$/.test(s))return false; // losse paginanummers voorkomen
  if(/^[-+]?\d+(?:\.\d+)?\s*(?:mm|m|kg|m2|m3)$/i.test(s))return false;
  if(source==="Property" && !/[\d_-]/.test(s) && s.split(/\s+/).length>3)return false;
  return true;
}
function parseIfc(buffer){
  const text=new TextDecoder("utf-8",{fatal:false}).decode(buffer);
  if(!text.includes("ISO-10303-21"))throw new Error("Dit is geen leesbaar IFC STEP-bestand.");
  const elements=[], elementById=new Map(),propById=new Map(),psetById=new Map(),
    links=[],types=new Map(),typesLinks=[],classes=new Map(),classLinks=[];
  const propNames=new Map(),typeCounts=new Map();
  const expression=/#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(/ig;
  let item;
  while((item=expression.exec(text))!==null){
    const expressId=+item[1],type=item[2].toUpperCase();
    const useful=type==="IFCPROPERTYSINGLEVALUE"||type==="IFCPROPERTYENUMERATEDVALUE"||
      type==="IFCPROPERTYSET"||type==="IFCRELDEFINESBYPROPERTIES"||
      type==="IFCRELDEFINESBYTYPE"||type.endsWith("TYPE")||
      type==="IFCRELASSOCIATESCLASSIFICATION"||
      type==="IFCCLASSIFICATIONREFERENCE"||
      (OBJECT_RE.test(type) && !type.endsWith("TYPE"));
    if(!useful)continue;
    const end=endArgs(text,expression.lastIndex);
    if(end<0)continue;
    const args=splitArgs(text.slice(expression.lastIndex,end));
    expression.lastIndex=end+1;
    if(type==="IFCPROPERTYSINGLEVALUE"||type==="IFCPROPERTYENUMERATEDVALUE"){
      const name=value(args[0]);
      const propValue=value(args[2]);
      if(name && propValue){
        propById.set(expressId,{name,value:propValue});
        propNames.set(name,(propNames.get(name)||0)+1);
      }
    } else if(type==="IFCPROPERTYSET"){
      psetById.set(expressId,{name:value(args[2]),props:refs(args[4])});
    } else if(type==="IFCRELDEFINESBYPROPERTIES"){
      links.push({pset:refs(args[5])[0],targets:refs(args[4])});
    } else if(type==="IFCRELDEFINESBYTYPE"){
      typesLinks.push({typeId:refs(args[5])[0],targets:refs(args[4])});
    } else if(type==="IFCCLASSIFICATIONREFERENCE"){
      classes.set(expressId,{id:value(args[1]),name:value(args[2])});
    } else if(type==="IFCRELASSOCIATESCLASSIFICATION"){
      classLinks.push({classId:refs(args[5])[0],targets:refs(args[4])});
    } else if(type.endsWith("TYPE")){
      // IfcTypeObject: predefined type may have HasPropertySets in argument 5.
      if(args[0]?.startsWith("'") && args.length>=6){
        types.set(expressId,{name:value(args[2]),psets:refs(args[5])});
      }
    } else if(/^'[A-Za-z0-9_$]{22}'$/.test(args[0]||"")){
      const entry={id:expressId,guid:value(args[0]),type,name:value(args[2]),
        tag:value(args[7]),objectType:value(args[4]), aliases:[]};
      elements.push(entry);
      elementById.set(expressId,entry);
      typeCounts.set(type,(typeCounts.get(type)||0)+1);
    }
  }
  const diagnostic={propertyNames:[...propNames.entries()].sort((a,b)=>b[1]-a[1]).slice(0,35),
    typeCounts:[...typeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18),
    propertyCandidates:0, inheritedTypes:0, classAliases:0};
  function alias(el,text,origin,weight=85,fragments=false){
    if(!looksLikeMark(text,origin==="Property"?"Property":""))return;
    const v=String(text).trim(),key=norm(v);
    if(key.length<2 || /^\d{1,2}$/.test(key) || key.length>90)return;
    const previous=el.aliases.find(a=>a.key===key);
    if(!previous)el.aliases.push({key,text:v,origin,weight});
    else if(previous.weight<weight){previous.weight=weight;previous.origin=origin;}
    if(fragments){
      const marks=v.match(/[\p{L}]{1,12}[\-_.\/\s]?\d{1,10}(?:[._\-\/]\d+){0,4}[\p{L}]?/gu)||[];
      for(const mark of marks)alias(el,mark,origin+" fragment",Math.max(55,weight-15),false);
    }
  }
  for(const el of elements){
    alias(el,el.tag,"Tag",100,true);
    alias(el,el.name,"Name",75,true);
    // ObjectType often has a useful prefab family/type description; do not trust as unique.
    alias(el,el.objectType,"ObjectType",45,true);
    // GUID allows deterministic exact match if present in PDF.
    alias(el,el.guid,"GUID",100,false);
  }
  function addPropertySets(el,ids,inherited=false){
    for(const id of ids){
      const pset=psetById.get(id);
      if(!pset)continue;
      for(const propId of pset.props){
        const prop=propById.get(propId);
        if(!prop)continue;
        const name=prop.name.toLowerCase();
        const likely=MARK_KEY_RE.test(name);
        const excluded=BAD_PROP_RE.test(name);
        // Only mark-looking values from likely identifiers or suspicious alphanumeric values
        if(!likely && (excluded || !/[\p{L}].*\d|\d.*[\p{L}]/u.test(prop.value)))continue;
        if(!looksLikeMark(prop.value,"Property"))continue;
        const weight=likely?(inherited?78:95):55;
        alias(el,prop.value,`PSet: ${pset.name} / ${prop.name}`,weight,true);
        diagnostic.propertyCandidates++;
      }
    }
  }
  for(const l of links){
    for(const id of l.targets){
      const el=elementById.get(id);
      if(el)addPropertySets(el,[l.pset]);
    }
  }
  for(const l of typesLinks){
    const type=types.get(l.typeId);
    if(!type)continue;
    for(const id of l.targets){
      const el=elementById.get(id);
      if(!el)continue;
      addPropertySets(el,type.psets,true);
      if(type.name)alias(el,type.name,"IFC Type Name",45,true);
      diagnostic.inheritedTypes++;
    }
  }
  for(const l of classLinks){
    const cls=classes.get(l.classId);
    if(!cls)continue;
    for(const id of l.targets){
      const el=elementById.get(id);
      if(!el)continue;
      alias(el,cls.id,"Classification",50,true);
      diagnostic.classAliases++;
    }
  }
  const index=new Map(), aliasExamples=[];
  for(const el of elements){
    for(const a of el.aliases){
      if(!index.has(a.key))index.set(a.key,new Map());
      index.get(a.key).set(el.guid,{element:el, alias:a});
    }
    if(el.aliases.length && aliasExamples.length<25){
      aliasExamples.push({type:el.type,mark:el.aliases
        .filter(a=>a.origin!=="GUID").slice(0,3).map(a=>a.text).join(" | ")});
    }
  }
  diagnostic.aliasExamples=aliasExamples;
  diagnostic.aliasCount=index.size;
  diagnostic.elementsWithAliases=elements.filter(e=>e.aliases.some(a=>a.origin!=="GUID")).length;
  return {elements,index,diagnostic};
}
function matchTokens(input,index) {
  // Detect multi-token IDs: 'W-12', 'HYD 004', '125.12.0047.1'.
  const words=tokenize(input);
  const results=new Map();
  for(let i=0;i<words.length;i++){
    let combined="";
    for(let n=1;n<=7 && i+n<=words.length;n++){
      combined+=words[i+n-1];
      if(combined.length>90)break;
      if(!index.has(combined))continue;
      if(combined.length<3 && !/^[A-Z]\d$/.test(combined))continue;
      const choices=index.get(combined);
      const original=words.slice(i,i+n).join("-");
      for(const [guid,record] of choices){
        const prior=results.get(guid);
        if(!prior || prior.alias.weight<record.alias.weight)
          results.set(guid,{...record, pdfMark:original, matchKey:combined});
      }
    }
  }
  return [...results.values()];
}
function detectVrachten(text){
  const result=[];
  const pattern=/\b(?:vracht(?:en)?|vr(?:acht)?\.?|truck|lading|load|transport(?:nummer|nr\.?)?)\s*(?:nr\.?|nummer|no\.?|#)?\s*[:#\-\u2013]?\s*0*(\d{1,3})\b/gi;
  for(const m of String(text).matchAll(pattern)){
    const n=Number(m[1]);
    if(n>=1 && n<=999)result.push({vracht:"Vracht "+String(n).padStart(2,"0"), offset:m.index});
  }
  return result;
}
function pdfRows(page) {
  if(Array.isArray(page.rows))return page.rows;
  if(Array.isArray(page.lines))return page.lines.map((text,i)=>({
    text,y:page.lines.length-i,x:0,items:[{x:0,y:page.lines.length-i,text}]
  }));
  return [];
}
function closestTruck(match,headers) {
  if(!headers.length)return null;
  const mx=match.x, my=match.y;
  return headers.reduce((best,h)=>{
    const distance=Math.abs(mx-h.x)+Math.max(0,h.y-my)*0.07;
    return (!best || distance<best.distance)?{...h,distance}:best;
  },null);
}
function analyzeDocument(pages,ifc){
  const candidateRows=[], byKey=new Map(), pdfPreview=[], evidence=[];
  const knownHeaders=[];
  let textCharacters=0, linesSeen=0, marksSeen=0;
  for(const page of pages){
    const rows=pdfRows(page);
    let pageHeaders=[], currentHeader=null, lastHeaderAt=-1;
    for(let i=0;i<rows.length;i++){
      const row=rows[i], text=row.text||"";
      textCharacters+=text.length;linesSeen++;
      if(text.trim() && pdfPreview.length<28)pdfPreview.push({page:page.page,line:text.trim().slice(0,160)});
      // Detect headings on the line AND in adjacent PDF text fragments.
      // Split text pieces can contain "VRACHT" + "03" as two separate items.
      // Keep the original X-position of each heading to understand PDF columns.
      const candidates=[];
      const parts=row.items||[];
      for(let pi=0;pi<parts.length;pi++){
        // Start uitsluitend op een vrachtlabel om geen foutieve kolompositie
        // toe te kennen als twee vrachtlabels op één PDF-regel staan.
        if(!/^(?:vracht|vr\.?|truck|load|lading|transport)/i.test(parts[pi].text.trim()))continue;
        for(let windowSize=1;windowSize<=Math.min(4,parts.length-pi);windowSize++){
          const fragment=parts.slice(pi,pi+windowSize).map(x=>x.text).join(" ");
          const labels=detectVrachten(fragment);
          if(labels.length!==1)continue;
          candidates.push({vracht:labels[0].vracht,x:parts[pi].x,y:row.y,page:page.page,row:i});
        }
      }
      if(!candidates.length){
        for(const truck of detectVrachten(text))
          candidates.push({vracht:truck.vracht,x:row.x||0,y:row.y,page:page.page,row:i});
      }
      const uniqueHeaders=candidates.filter((h,idx,all)=>all.findIndex(x=>x.vracht===h.vracht && Math.abs(x.x-h.x)<20)===idx);
      if(uniqueHeaders.length){
        pageHeaders=pageHeaders.filter(h=>!uniqueHeaders.some(n=>Math.abs(n.x-h.x)<20));
        pageHeaders.push(...uniqueHeaders);
        if(uniqueHeaders.length===1){
          currentHeader=uniqueHeaders[0];
          lastHeaderAt=i;
        }
        knownHeaders.push(...uniqueHeaders);
      }
      // Test each visual PDF item and the complete reconstructed line.
      const blocks=[{text,x:row.x||0,y:row.y,source:"regel"}];
      for(const item of row.items||[])
        if(item.text && item.text.length>=2)blocks.push({text:item.text,x:item.x,y:item.y,source:"tekstpositie"});
      // Include a 2-row window for cases where PDF rendering separates mark and number.
      if(i>0 && !uniqueHeaders.length){
        const above=rows[i-1];
        if(above && Math.abs(above.y-row.y)<35){
          blocks.push({text:(above.text||"")+" "+text,
            x:row.x||0,y:row.y,source:"naburige regels"});
        }
      }
      const found=new Map();
      for(const block of blocks){
        for(const match of matchTokens(block.text,ifc.index)){
          const prev=found.get(match.element.guid);
          if(!prev || prev.alias.weight<match.alias.weight ||
             (prev.source!=="tekstpositie" && block.source==="tekstpositie")){
            found.set(match.element.guid,{...match,x:block.x,y:block.y,source:block.source});
          }
        }
      }
      if(!found.size)continue;
      for(const item of found.values()){
        marksSeen++;
        let chosen=null,method="",contextQuality=0;
        if(uniqueHeaders.length===1) {
          chosen=uniqueHeaders[0];method="SAME_ROW";contextQuality=100;
        } else if(uniqueHeaders.length>1){
          chosen=closestTruck(item,uniqueHeaders);
          method="SAME_ROW_COLUMNS";contextQuality=80;
        } else if(pageHeaders.length>1 && pageHeaders.every(h=>h.y>=row.y)){
          chosen=closestTruck(item,pageHeaders);
          method="COLUMN_CONTEXT";contextQuality=78;
        } else if(currentHeader && (i-lastHeaderAt)<=70){
          chosen=currentHeader;method="SECTION_CONTEXT";contextQuality=72;
        } else if(pageHeaders.length===1 && pageHeaders[0].row<=i){
          chosen=pageHeaders[0];method="SECTION_CONTEXT";contextQuality=68;
        }
        const matches=ifc.index.get(item.matchKey);
        const unique=matches?.size===1;
        const aliasWeight=item.alias.weight;
        const status=(unique && !!chosen && contextQuality>=72 &&
            aliasWeight>=75)?"proposed":"needs_review";
        const confidence=(!chosen?0: !unique?0:
          Math.min(98,Math.round(contextQuality*0.7+aliasWeight*0.28)));
        const rowData={
          mark:item.pdfMark,
          ifcMark:item.alias.text,
          guid:item.element.guid,
          vracht:chosen?.vracht||"",
          page:page.page,
          confidence,
          method:!chosen?"NO_VRACHT_CONTEXT":!unique?"DUPLICATE_MARK":method,
          source:item.alias.origin,
          status,
          evidence:text.slice(0,250),
          _identifier:item.matchKey
        };
        const key=[rowData.guid,rowData.vracht||"?",rowData.page].join("|");
        const prev=byKey.get(key);
        if(!prev || prev.confidence<rowData.confidence)byKey.set(key,rowData);
      }
    }
  }
  candidateRows.push(...byKey.values());
  const byGuid=new Map();
  for(const row of candidateRows){
    if(!byGuid.has(row.guid))byGuid.set(row.guid,new Set());
    if(row.vracht)byGuid.get(row.guid).add(row.vracht);
  }
  for(const row of candidateRows){
    if(byGuid.get(row.guid)?.size>1){
      row.status="needs_review";row.confidence=0;row.method="CONFLICT";
    }
  }
  const noTruck=candidateRows.filter(r=>!r.vracht).length;
  const diagnostic={
    textCharacters,linesSeen,marksSeen,
    detectedVrachten:[...new Set(knownHeaders.map(x=>x.vracht))],
    pdfPreview:pdfPreview.slice(0,20),
    ifcAliases:ifc.diagnostic.aliasExamples,
    ifcTypes:ifc.diagnostic.typeCounts,
    propertyNames:ifc.diagnostic.propertyNames,
    aliasCount:ifc.diagnostic.aliasCount,
    elementsWithAliases:ifc.diagnostic.elementsWithAliases,
    noTruck,
    notes: [
      "Het bestand bevat "+ifc.elements.length+" herkende IFC-elementen.",
      "Niet iedere PDF-identificatie hoort bij de vracht die visueel het dichtst staat.",
      "Bij dubbels/conflicten is handmatige bevestiging verplicht."
    ]
  };
  return {rows:candidateRows,indexedElements:ifc.elements.length,
    markedElements:ifc.diagnostic.elementsWithAliases,diagnostic};
}
async function extractPdfPages(buffer, library){
  if(!library?.getDocument)throw new Error("PDF.js kon niet geladen worden. Controleer toegang tot cdnjs.cloudflare.com.");
  library.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const doc=await library.getDocument({data:new Uint8Array(buffer),isEvalSupported:false}).promise;
  const pages=[];
  try{
    for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
      const page=await doc.getPage(pageNo);
      const content=await page.getTextContent({disableCombineTextItems:false});
      const pdfItems=(content.items||[]).filter(x=>x.str && x.str.trim()).map(x=>({
        text:x.str,
        x:Number(x.transform?.[4]||0),
        y:Number(x.transform?.[5]||0),
        width:Number(x.width||0),
        height:Number(x.height||0)
      }));
      pdfItems.sort((a,b)=>b.y-a.y || a.x-b.x);
      const groups=[];
      for(const item of pdfItems){
        let group=groups.find(g=>Math.abs(g.y-item.y)<=Math.max(2,Math.min(6,item.height/3)));
        if(!group){
          group={x:item.x,y:item.y,items:[],text:""};
          groups.push(group);
        }
        group.items.push(item);
        group.x=Math.min(group.x,item.x);
      }
      groups.sort((a,b)=>b.y-a.y);
      for(const group of groups){
        group.items.sort((a,b)=>a.x-b.x);
        group.text=group.items.map(x=>x.text).join(" ").replace(/\s+/g," ").trim();
      }
      pages.push({page:pageNo, rows:groups, lines:groups.map(x=>x.text)});
      page.cleanup();
    }
  }finally{await doc.destroy();}
  return pages;
}
function csv(rows,project,ifcName,pdfName){
  const columns=["Project","IFC","PDF","GUID","IFC-markering","PDF-markering","Vracht",
    "PDF-pagina","Koppeling","Confidence","Beslissing","Bron eigenschap","PDF bewijs"];
  const data=[columns];
  for(const row of rows){
    data.push([project,ifcName,pdfName,row.guid,row.ifcMark,row.mark,row.vracht,
      row.page,row.method,row.confidence,row.status,row.source,row.evidence]);
  }
  const safe=x=>{
    const value=String(x??"");
    const escaped=/^\s*[=+\-@]/.test(value)?"'"+value:value;
    return `"${escaped.replace(/"/g,'""')}"`;
  };
  return "\ufeff"+data.map(row=>row.map(safe).join(";")).join("\r\n");
}
const api={parseIfc,extractPdfPages,analyzeDocument,csv,norm,matchTokens,detectVrachten,
  splitArgs,value};
scope.TrimbleAnalysis=api;
if(typeof module!=="undefined" && module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
