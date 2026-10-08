/* V6 — browser-only PDF color analysis and IFC positional proposals.
   Zero API keys. No calls to external AI. All spatial matches need manual confirmation.
*/
(function(scope) {
"use strict";
const norm=s=>String(s??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rgbToHex(rgb){
  return "#"+rgb.map(n=>clamp(Math.round(n),0,255).toString(16).padStart(2,"0")).join("");
}
function hexToRgb(hex){
  const match=/^#([0-9a-f]{6})$/i.exec(String(hex));
  if(!match)return null;
  return [0,2,4].map(offset=>parseInt(match[1].slice(offset,offset+2),16));
}
function colorDistance(a,b){
  // Red/green/blue Euclidean distance. Conservative threshold, distinguish similar colors.
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
}
function colorful(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  return max>115 && max-min>55 && (max-min)/Math.max(1,max)>.25;
}
function pixel(image,x,y){
  const {width,height,data}=image;
  const xx=Math.round(x),yy=Math.round(y);
  if(xx<0||xx>=width||yy<0||yy>=height)return null;
  const i=(yy*width+xx)*4;
  return [data[i],data[i+1],data[i+2]];
}
function extractLegendColors(image){
  const {width:w,height:h}=image;
  const candidates=[];
  const x0=Math.floor(w*.525),x1=Math.floor(w*.97);
  // Read uniform horizontal color runs from upper/right area of technical drawing.
  for(let y=2;y<Math.floor(h*.69);y+=2){
    let x=x0;
    while(x<x1){
      const c=pixel(image,x,y);
      if(!c||!colorful(...c)){x+=2;continue;}
      const start=x,seed=c;
      x++;
      while(x<x1){
        const next=pixel(image,x,y);
        if(!next||!colorful(...next)||colorDistance(next,seed)>24)break;
        x++;
      }
      const widthRun=x-start;
      if(widthRun>=Math.max(18,w*.017) && widthRun< w*.16){
        candidates.push({x:start,y,width:widthRun,color:seed,center:start+widthRun/2});
      }
      x+=2;
    }
  }
  const clusters=[];
  for(const c of candidates){
    const found=clusters.find(g=>
      (c.y-g.lastY)<=5 && Math.abs(c.center-g.x)<Math.max(10,w*.012) &&
      colorDistance(c.color,g.color)<35);
    if(found){
      found.lastY=c.y;
      found.count++;
      found.x=(found.x*(found.count-1)+c.center)/found.count;
      found.width=Math.max(found.width,c.width);
      found.y2=c.y;
    }else{
      clusters.push({x:c.center,y:c.y,y2:c.y,lastY:c.y,width:c.width,
        color:c.color,count:1});
    }
  }
  let blocks=clusters.filter(c=>c.count>=3 && c.width>=Math.max(18,w*.017) &&
    c.y2-c.y>=3 && c.y2-c.y<=Math.max(75,h*.065));
  // The legend is a vertical list of swatches with very similar x center.
  // Find the stack with the most swatches, then sort top->bottom.
  const groups=[];
  for(const block of blocks){
    let group=groups.find(g=>Math.abs(g.x-block.x)<Math.max(15,w*.025));
    if(!group){group={x:block.x,blocks:[]};groups.push(group);}
    group.blocks.push(block);
    group.x=group.blocks.reduce((sum,b)=>sum+b.x,0)/group.blocks.length;
  }
  groups.sort((a,b)=>b.blocks.length-a.blocks.length ||
    b.blocks.reduce((s,x)=>s+x.width*x.count,0)-
    a.blocks.reduce((s,x)=>s+x.width*x.count,0));
  blocks=(groups[0]?.blocks||[]).sort((a,b)=>a.y-b.y);
  const merged=[];
  for(const b of blocks){
    const prior=merged[merged.length-1];
    if(prior && (b.y-prior.y2)<Math.max(5,h*.008) && colorDistance(prior.color,b.color)<45){
      prior.y2=Math.max(prior.y2,b.y2);
      prior.count+=b.count;
    }else merged.push({...b});
  }
  // A vertical color legend is only credible when at least 3 swatches are present.
  if(merged.length<3)return [];
  return merged.slice(0,30).map((b,index)=>({
    cargo:index+1, color:rgbToHex(b.color), x:b.x, y:(b.y+b.y2)/2,
    sampleCount:b.count, source:"automatic-order-review"
  }));
}
function hue(rgb){
  const [r,g,b]=rgb.map(v=>v/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(delta<.001)return 0;
  let h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
  return ((h*60)%360+360)%360;
}
function paletteDistance(a,b){
  const d=Math.abs(hue(a)-hue(b));
  const hueDiff=Math.min(d,360-d);
  // Preserve saturation/lightness too: red and salmon share a hue but differ in shade.
  return colorDistance(a,b)+hueDiff*2.2;
}
function matchColor(rgb,legend,threshold=150){
  if(!rgb||!colorful(...rgb))return null;
  const matches=legend.map(entry=>({entry,distance:paletteDistance(rgb,hexToRgb(entry.color)||[0,0,0])}))
    .sort((a,b)=>a.distance-b.distance);
  if(!matches.length||matches[0].distance>threshold)return null;
  // Ambiguous colors stay unmatched rather than a confident wrong cargo.
  if(matches.length>1 && (matches[1].distance-matches[0].distance)<12)return null;
  return {...matches[0].entry,distance:matches[0].distance};
}
function sampleColorAt(image,x,y,legend){
  const voting=new Map(), samples=[];
  const step=Math.max(3,Math.round(image.width*.004));
  for(const dx of [-step*2,-step,0,step,step*2]){
    for(const dy of [-step*2,-step,0,step,step*2]){
      const rgb=pixel(image,x+dx,y+dy);
      if(!rgb)continue;
      const nearest=matchColor(rgb,legend);
      if(!nearest)continue;
      const id=Number(nearest.cargo);
      if(!voting.has(id))voting.set(id,{cargo:id,color:nearest.color,count:0,totalError:0});
      const v=voting.get(id);
      v.count++;v.totalError+=nearest.distance;
      samples.push(rgb);
    }
  }
  const ranked=[...voting.values()].sort((a,b)=>b.count-a.count||a.totalError/b.count-b.totalError/a.count);
  const best=ranked[0];
  // Conservative: four or more nearby colored samples must agree.
  if(!best || best.count<4)return null;
  if(ranked[1] && ranked[1].count>=best.count*.7)return null;
  return {...best,coverage:best.count/25,averageError:best.totalError/best.count};
}
function splitArgs(text){
  const result=[];let start=0,depth=0,quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==="'"){if(quoted&&text[i+1]==="'"){i++;continue;}quoted=!quoted;}
    else if(!quoted&&ch==="(")depth++;
    else if(!quoted&&ch===")")depth--;
    else if(!quoted&&depth===0&&ch===","){
      result.push(text.slice(start,i).trim());start=i+1;
    }
  }
  result.push(text.slice(start).trim());
  return result;
}
function findEnd(text,start){
  let depth=1,quoted=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(ch==="'"){if(quoted&&text[i+1]==="'"){i++;continue;}quoted=!quoted;}
    else if(!quoted&&ch==="(")depth++;
    else if(!quoted&&ch===")"&&--depth===0)return i;
  }
  return -1;
}
function ref(s){return Number((/#(\d+)/.exec(s||"")||[])[1]||0);}
function parsePlacementCoordinates(buffer,elements){
  const txt=new TextDecoder("utf-8",{fatal:false}).decode(buffer);
  const points=new Map(),axes=new Map(),placements=new Map(),objects=new Map();
  const entity=/#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(/g;
  let m;
  while((m=entity.exec(txt))){
    const id=Number(m[1]),type=m[2];
    if(type!=="IFCCARTESIANPOINT"&&type!=="IFCAXIS2PLACEMENT3D"&&
       type!=="IFCLOCALPLACEMENT" &&
       !/^IFC[A-Z0-9_]+$/.test(type))continue;
    const isObject=type.startsWith("IFC") && !/TYPE$/.test(type);
    if(!isObject || type==="IFCCARTESIANPOINT"||type==="IFCAXIS2PLACEMENT3D"||type==="IFCLOCALPLACEMENT"){
      // Handled below.
    }
    const end=findEnd(txt,entity.lastIndex);
    if(end<0)continue;
    const args=splitArgs(txt.slice(entity.lastIndex,end));
    entity.lastIndex=end+1;
    if(type==="IFCCARTESIANPOINT"){
      const values=(args[0]||"").replace(/^\(/,"").replace(/\)$/,"");
      const n=splitArgs(values).map(Number);
      if(n.length>=2 && n.every(Number.isFinite))points.set(id,{x:n[0],y:n[1],z:n[2]||0});
    }else if(type==="IFCAXIS2PLACEMENT3D"){
      axes.set(id,{point:ref(args[0])});
    }else if(type==="IFCLOCALPLACEMENT"){
      placements.set(id,{parent:ref(args[0]),axis:ref(args[1])});
    }else if(/^'[A-Za-z0-9_$]{22}'$/.test(args[0]||"") && args.length>7){
      // All IFC Element-derived objects place ObjectPlacement at index 5.
      const gid=args[0].slice(1,-1), placement=ref(args[5]);
      if(placement)objects.set(gid,{placement});
    }
  }
  function position(id,seen=new Set()){
    if(!id||seen.has(id))return{x:0,y:0,z:0,valid:false};
    const pl=placements.get(id);
    if(!pl)return{x:0,y:0,z:0,valid:false};
    const here=points.get(axes.get(pl.axis)?.point);
    if(!here)return{x:0,y:0,z:0,valid:false};
    if(!pl.parent)return{...here,valid:true};
    seen.add(id);
    const parent=position(pl.parent,seen);
    // Translation only, ignores rotations; resulting ordered coordinate is approximate.
    if(!parent.valid)return{...here,valid:true};
    return{x:here.x+parent.x,y:here.y+parent.y,z:here.z+parent.z,valid:true};
  }
  const results=[];
  for(const e of elements||[]){
    const entry=objects.get(e.guid);
    if(!entry)continue;
    const xyz=position(entry.placement);
    if(!xyz.valid)continue;
    results.push({
      guid:e.guid,type:e.type,mark:e.tag||e.name||e.aliases?.[0]?.text||"",
      x:xyz.x,y:xyz.y,z:xyz.z
    });
  }
  return results;
}
function mapPlacementToPoint(element,geometry,top,bottom,reversed=false){
  if(geometry.length<2 || !top || !bottom)return null;
  const ys=geometry.map(e=>e.y);
  const yMin=Math.min(...ys),yMax=Math.max(...ys);
  if(Math.abs(yMax-yMin)<1e-5)return null;
  let t=(yMax-element.y)/(yMax-yMin);
  if(reversed)t=1-t;
  return {x:top.x+(bottom.x-top.x)*t,y:top.y+(bottom.y-top.y)*t,t};
}
function proposeColorAssignments(image,legend,geometry,calibration,options={}){
  const {top,bottom,reversed=false,page=1}=calibration||{};
  if(!top||!bottom)return [];
  const chosen=(geometry||[]).filter(x=>x.type===options.type);
  if(chosen.length<2)return [];
  const result=[];
  for(const el of chosen){
    const pos=mapPlacementToPoint(el,chosen,top,bottom,reversed);
    if(!pos)continue;
    const match=sampleColorAt(image,pos.x,pos.y,legend);
    if(!match)continue;
    result.push({
      mark:el.mark||"",ifcMark:el.mark||"",guid:el.guid,
      vracht:"Vracht "+String(match.cargo).padStart(2,"0"),
      page,confidence:Math.min(65,Math.round(30+match.coverage*30)),
      method:"VISUAL_POSITION_REVIEW",
      status:"needs_review",source:"PDF kleur + IFC plaatsingspositie",
      evidence:`Kleur ${match.color}; pixel (${Math.round(pos.x)}, ${Math.round(pos.y)}); `+
        `IFC Y=${Math.round(el.y)}; controleer deze ligging handmatig.`,
      visualCargo:match.cargo
    });
  }
  return result;
}
const api={rgbToHex,hexToRgb,colorDistance,colorful,pixel,
 extractLegendColors,matchColor,sampleColorAt,parsePlacementCoordinates,
 mapPlacementToPoint,proposeColorAssignments};
scope.TrimbleVisual=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
