/* Bridge to the official Trimble Connect Workspace Viewer API.
   ModelSpec.id is a file identifier, ModelSpec.versionId is used for viewer objects.
   IFC STEP GlobalId is 22-character compressed; the viewer expects an external
   uncompressed GUID for convertToObjectRuntimeIds.
*/
(function(scope){
"use strict";
const alphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuidToUuid(guid){
  const source=String(guid||"").trim();
  if(source.length===36 && /^[0-9A-Fa-f-]{36}$/.test(source))return source.toLowerCase();
  if(!/^[0-9A-Za-z_$]{22}$/.test(source))throw new Error("Dit IFC-object heeft geen geldige 22-tekens GlobalId.");
  function decode(s){
    let n=0;
    for(const ch of s){
      const i=alphabet.indexOf(ch);
      if(i<0)throw new Error("Ongeldige IFC-GUID.");
      n=n*64+i;
    }
    return n;
  }
  const first=decode(source.slice(0,2));
  if(first>255)throw new Error("IFC-GUID buiten bereik.");
  let hex=first.toString(16).padStart(2,"0");
  for(let i=2;i<22;i+=4)hex+=decode(source.slice(i,i+4)).toString(16).padStart(6,"0");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function isIfcModel(m){
  return String(m?.name||"").toLowerCase().endsWith(".ifc") ||
    /\bifc\b/i.test(String(m?.type||""));
}
async function getLoadedIfcModels(api){
  if(!api?.viewer?.getModels)throw new Error("De Trimble 3D-viewer is niet beschikbaar via Workspace API.");
  const models=await api.viewer.getModels("loaded");
  if(!Array.isArray(models))throw new Error("Trimble stuurde geen lijst met geladen modellen.");
  return models.filter(isIfcModel).map(m=>({
    id:String(m.id||""),
    versionId:String(m.versionId||""),
    name:String(m.name||"IFC"),
    state:m.state,
    type:m.type,
    isLatestVersion:m.isLatestVersion
  })).filter(m=>m.id && m.versionId);
}
async function sourceFile(api,model){
  if(!model?.id||!model.versionId)throw new Error("Kies eerst een IFC-model dat in de viewer geladen is.");
  let loaded, error;
  try { loaded=await api.viewer.getLoadedModel(model.versionId); }
  catch(e) {error=e;try {loaded=await api.viewer.getLoadedModel(model.id);} catch{}}
  if(loaded){
    if(loaded.versionId && String(loaded.versionId)!==String(model.versionId)){
      throw new Error("Viewer-versie en bestandsversie verschillen. Laad de IFC opnieuw in Trimble voordat je analyseert.");
    }
    if(loaded.id){
      return {id:String(loaded.id),name:String(loaded.name||model.name),
        versionId:model.versionId, modelId:model.id,
        via:"viewer.getLoadedModel"};
    }
  }
  // Workspace ModelSpec.id is the model file ID. This fallback uses that ID
  // only if the model version and name are known; never reverts to browsing.
  if(isIfcModel(model)){
    if(model.isLatestVersion===false){
      throw new Error("Deze oude modelversie kon niet exact worden opgehaald. "+
        "Laad de gewenste versie opnieuw of kies een andere IFC.");
    }
    return {id:model.id,name:model.name,versionId:model.versionId,
      modelId:model.id,via:"viewer.getModels",warning:error?.message||"Viewer-bestandsmetadata niet beschikbaar"};
  }
  throw new Error("Geen IFC-bronbestand voor dit viewer-model gevonden.");
}
async function locateObject(api,model,ifcGuid){
  if(!model?.versionId)throw new Error("Er is geen geldig geladen model geselecteerd.");
  const uuid=ifcGuidToUuid(ifcGuid),externalIds=[uuid,String(ifcGuid)];
  let objectRuntimeId=null;
  for(const id of externalIds){
    try {
      const result=await api.viewer.convertToObjectRuntimeIds(model.versionId,[id]);
      if(result?.[0]!==undefined && result[0]!==null){
        objectRuntimeId=Number(result[0]);
        if(Number.isFinite(objectRuntimeId))break;
      }
    } catch {}
  }
  if(!Number.isFinite(objectRuntimeId) || objectRuntimeId===null) {
    throw new Error("GUID niet gevonden in dit geladen model. Controleer de gekozen IFC-versie.");
  }
  const selector={modelObjectIds:[{modelId:model.versionId,objectRuntimeIds:[objectRuntimeId]}]};
  await api.viewer.setSelection(selector,"set");
  let fitted=false, warning="";
  try {await api.viewer.setCamera(selector,{animationTime:350});fitted=true;}
  catch(e){warning="Object geselecteerd; automatisch inzoomen werd door de viewer geweigerd.";}
  return {runtimeId:objectRuntimeId,selected:true,fitted,warning};
}
scope.TrimbleViewerModel={getLoadedIfcModels,sourceFile,locateObject,ifcGuidToUuid,isIfcModel};
if(typeof module!=="undefined"&&module.exports)module.exports=scope.TrimbleViewerModel;
})(typeof window!=="undefined"?window:globalThis);
