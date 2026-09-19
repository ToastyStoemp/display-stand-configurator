/* Project persistence, product mockups, fabrication and editor history. */
'use strict';
const studio={products:[],fabrication:{kerf:0,relief:0},past:[],future:[],snapshot:null,restoring:false,saveTimer:null,productGroup:null,textures:new Map(),issues:[]};
const SAVE_KEY='display-stand-project-v4';
const escapeHTML=Fabrication ? s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : String;
document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="studio.css">');
$('.projectActions').insertAdjacentHTML('beforeend',`<button id="importProject">Open JSON</button><input id="projectFile" type="file" accept=".json,application/json" hidden><button id="projectUndo">Undo</button><button id="projectRedo">Redo</button><span id="saveState" class="saveState" role="status">Ready</span>`);
$('.viewNav').insertAdjacentHTML('beforeend','<a href="#productsPanel">Products</a><a href="#fabricationPanel">Fabrication</a>');
$('#sideLayout').insertAdjacentHTML('beforebegin',`
<section id="productsPanel" class="studioPanel"><h2>Products in your display</h2><p>Create a product, then assign it to a tray. Width runs across the stand; height stands upright; thickness runs along the floor. Images appear on the front face.</p>
<div class="grid"><label>Product<select id="productSelect"></select></label><label>Selected tray<select id="productTray"></select></label></div>
<div class="actions"><button id="newProduct">+ New product</button><button id="assignProduct">Place on selected tray</button><button id="clearProduct">Clear selected tray</button><button id="deleteProduct">Delete product</button></div>
<div class="actions"><button id="exportProduct">Export selected product</button><button id="exportProductLibrary">Export all products</button><button id="importProducts">Import products</button><input id="productsFile" type="file" accept=".json,application/json" hidden></div><p class="hint">Product files include dimensions and images. Import adds independent copies to this design; place them on trays when ready.</p><p id="productTransferStatus" role="status"></p>
<div id="productFields" class="grid"><label>Name<input id="productName" maxlength="80"></label><label>Width (mm)<input id="productWidth" type="number" min="1" max="1500" step="0.1"></label><label>Height (mm)<input id="productHeight" type="number" min="1" max="1500" step="0.1"></label><label>Thickness (mm)<input id="productDepth" type="number" min="0.1" max="1000" step="0.1"></label><label>Gap between products (mm)<input id="productGap" type="number" min="0" max="100" step="0.1"></label><label>Quantity per tray (0 = fill)<input id="productQuantity" type="number" min="0" max="500" step="1"></label><label>Front image (PNG, JPEG, WebP)<input id="productImage" type="file" accept="image/png,image/jpeg,image/webp"></label><div><img id="productImagePreview" class="productImage" alt="Product image preview" hidden><button id="clearImage">Remove image</button></div></div>
<p id="productSummary" class="productSummary" aria-live="polite"></p><p class="hint">Products share the tray angle and fill from the rear wall forward. Images keep their proportions. This is a visual packing preview, not a stability or load simulation.</p></section>
<section id="checksPanel" class="studioPanel"><h2>Design checks</h2><ul id="designChecks" class="checkList" aria-live="polite"></ul><p class="hint">Checks cover part intersections, connected contours, joint engagement, spacing, and product fit. Assembly travel and strength are not simulated.</p></section>`);
document.querySelector('main').insertAdjacentHTML('beforeend',`
<section id="fabricationPanel" class="studioPanel"><h2>Fabrication</h2><p>Export every physical part at 1:1 scale in millimetres, including both side panels. The preview shows the cutting paths. Parts are arranged on a free-size sheet, not nested to a stock size.</p><div class="grid"><label>Full kerf width (mm)<input id="kerf" type="number" min="0" max="3" value="0" step="0.01"></label><label>Circular corner relief diameter (mm)<input id="relief" type="number" min="0" max="10" value="0" step="0.1"></label></div><p class="hint">Kerf offsets paths into waste by half the entered width. Set it to 0 if your cutter software compensates. Relief removes circles centred on internal corners and is included in the 3D model. Use 0 to keep square corners. Relief is distinct from outer corner rounding.</p><div class="actions"><button id="previewCuts">Preview cutting layout</button><button id="exportSVG">Export SVG</button><button id="exportDXF">Export DXF</button><button id="exportPartsList">Export part list CSV</button></div><p id="fabricationStatus" role="status">No cutting preview generated yet.</p><div id="cutPreview"></div><p class="hint">SVG and DXF contain cut contours only. Labels appear in the preview and the separate parts list so they cannot accidentally be cut. These are 2D profiles; no printer toolpath is generated.</p></section>`);

const baseConfiguration=configuration;
configuration=function(){
  const data=baseConfiguration();
  for(const [id,[min,max]] of Object.entries(settingRanges))if($('#'+id).value===''||!Number.isFinite(data.settings[id])||data.settings[id]<min||data.settings[id]>max)data.settings[id]=studio.snapshot?JSON.parse(studio.snapshot).settings[id]:min;
  return {...data,version:5,products:studio.products.map(p=>({...p})),fabrication:{...studio.fabrication}};
};
function historyButtons(){const undo=!studio.past.length,redo=!studio.future.length;$('#undoEdit').disabled=undo;$('#projectUndo').disabled=undo;$('#projectRedo').disabled=redo;}
function saveSoon(){clearTimeout(studio.saveTimer);$('#saveState').textContent='Saving…';studio.saveTimer=setTimeout(saveNow,350);}
function saveNow(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(configuration()));$('#saveState').textContent='Saved on this device';}catch(e){$('#saveState').textContent='Could not autosave — export JSON to keep your design';}}
document.addEventListener('focusin',()=>studio.editSession=null);
function checkpoint(){if(studio.restoring||editor.drag)return;const next=JSON.stringify(configuration());if(next===studio.snapshot)return;if(studio.snapshot){const active=document.activeElement,typing=active?.tagName==='INPUT'&&active.type!=='checkbox'&&active.type!=='file';if(!typing||studio.editSession!==active){studio.past.push(studio.snapshot);if(studio.past.length>40)studio.past.shift();}studio.editSession=typing?active:null;}studio.future=[];studio.snapshot=next;historyButtons();saveSoon();}
remember=function(){};
function restore(data){
  studio.restoring=true;
  try{
    S.trays=data.trayGroups.map(t=>makeTray(t));Object.entries(data.settings).forEach(([id,v])=>$('#'+id).value=v);
    studio.products=data.products.map(p=>({...p}));studio.fabrication={...data.fabrication};
    const v=data.view||{};for(const [key,id] of Object.entries({measurements:'showDimensions',snap:'snapEnabled',linkedEdit:'linkedEdit',xray:'xrayView'}))if(typeof v[key]==='boolean')$('#'+id).checked=v[key];
    if([1,5,10].includes(v.snapStep))$('#snapSize').value=v.snapStep;
    $('#kerf').value=studio.fabrication.kerf;$('#relief').value=studio.fabrication.relief;
    editor.selected=Math.max(0,Math.min(editor.selected,expandedTrays().length-1));ui();render();productUI();
  }finally{studio.restoring=false;}
}
function navigateHistory(direction){if(editor.drag)return;studio.editSession=null;const from=direction==='undo'?studio.past:studio.future,to=direction==='undo'?studio.future:studio.past;if(!from.length)return;const next=from.pop();to.push(studio.snapshot);restore(JSON.parse(next));studio.snapshot=next;historyButtons();saveSoon();toast(direction==='undo'?'Change undone':'Change redone');}
undoEdit=function(){navigateHistory('undo');};
$('#undoEdit').onclick=undoEdit;$('#projectUndo').onclick=undoEdit;$('#projectRedo').onclick=()=>navigateHistory('redo');
const baseFinishDimension=finishDimension;
finishDimension=function(cancel=false){
  if(!editor.drag)return;
  if(editor.drag.next===undefined)cancel=true;
  if(cancel){const original=JSON.parse(studio.snapshot);baseFinishDimension(false);restore(original);}
  else baseFinishDimension(false);
  checkpoint();
};
const originalBeginDimension=beginDimension;
beginDimension=function(...args){studio.editSession=null;originalBeginDimension(...args);};
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  if(e.key.toLowerCase()==='z'||e.key.toLowerCase()==='y'){e.preventDefault();navigateHistory(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');}
});
window.addEventListener('pagehide',saveNow);

const settingRanges={mat:[.1,50],frontHeightDefault:[0,1000],extDefault:[0,1000],partLength:[50,1500],frontGrip:[0,1000],toeExtra:[0,40],sideRadius:[0,12],rearExtra:[0,40]};
function validateProducts(products){
  const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${label} must be between ${min} and ${max}.`);return v;};
if(!Array.isArray(products)||products.length>50)throw Error('A project supports up to 50 products.');
  const ids=new Set();const safeProducts=products.map(p=>{
    if(typeof p.id!=='string'||p.id.length>100||ids.has(p.id))throw Error('Product IDs must be unique.');ids.add(p.id);
    if(p.image&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)||p.image.length>1500000))throw Error('A product image is invalid or too large.');
    return {id:p.id,name:String(p.name||'Product').slice(0,80),width:finite(p.width,1,1500,'Product width'),height:finite(p.height,1,1500,'Product height'),depth:finite(p.depth,.1,1000,'Product thickness'),gap:finite(p.gap,0,100,'Product gap'),quantity:Math.round(finite(p.quantity,0,500,'Product quantity')),image:p.image||''};
  });
  return safeProducts;
}
function validateProject(raw){
  if(!raw||raw.schema!=='display-stand-config'||![3,4,5].includes(raw.version)||raw.units!=='mm')throw Error('Choose a version 3, 4 or 5 display-stand project in millimetres.');
  const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${label} must be between ${min} and ${max}.`);return v;};
  const settings=Object.fromEntries(Object.entries(settingRanges).map(([k,r])=>[k,finite(raw.settings?.[k],...r,k)]));
  if(!Array.isArray(raw.trayGroups)||!raw.trayGroups.length||raw.trayGroups.length>100)throw Error('A project needs 1–100 tray groups.');
  const safeProducts=validateProducts(raw.products??[]),ids=new Set(safeProducts.map(p=>p.id));
  let count=0;const trayGroups=raw.trayGroups.map(t=>{const result={};for(const [k,r] of Object.entries({depth:[.1,1000],angle:[-60,60],wall:[.1,1000],frontHeight:[0,1000],extend:[0,1000],count:[1,100]}))result[k]=finite(t[k],...r,k);if(!Number.isInteger(result.count))throw Error('Tray counts must be whole numbers.');count+=result.count;if(t.productId){if(!ids.has(t.productId))throw Error('A tray references a missing product.');result.productId=t.productId;}if(t.placements!==undefined){
      if(!Array.isArray(t.placements)||t.placements.length>500)throw Error('A tray supports up to 500 manually placed products.');
      const placementIds=new Set();result.placements=t.placements.map(item=>{
        if(!item||typeof item.id!=='string'||!item.id||item.id.length>100||placementIds.has(item.id)||!ids.has(item.productId))throw Error('Invalid or duplicate placed product.');
        placementIds.add(item.id);return {id:item.id,productId:item.productId,x:finite(item.x,-5000,5000,'Product position'),z:finite(item.z,-5000,5000,'Product position')};
      });delete result.productId;
    }return result;});
  if(count>100)throw Error('A project supports up to 100 physical trays.');
  return {schema:raw.schema,version:5,units:'mm',settings,trayGroups,products:safeProducts,fabrication:{kerf:finite(raw.fabrication?.kerf??0,0,3,'Kerf'),relief:finite(raw.fabrication?.relief??0,0,10,'Relief')},view:raw.view||{}};
}
$('#importProject').onclick=()=>$('#projectFile').click();
$('#projectFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>8000000)throw Error('Project exceeds the 8 MB limit.');const data=validateProject(JSON.parse(await file.text())),previous=configuration();try{restore(data);}catch(error){restore(previous);throw error;}checkpoint();toast('Project opened — Undo restores your previous design');}catch(error){$('#saveState').textContent='Open failed: '+error.message;}finally{e.target.value='';}
};

function currentProduct(){return studio.products.find(p=>p.id===$('#productSelect').value);}
function productBundle(products){return {schema:'display-stand-products',version:1,units:'mm',products:validateProducts(products)};}
function importedProducts(raw,existing,newId=()=>crypto.randomUUID()){
  if(!raw||raw.schema!=='display-stand-products'||raw.version!==1||raw.units!=='mm')throw Error('Choose a product JSON file exported by this configurator.');
  const products=validateProducts(raw.products);
  if(!products.length)throw Error('This file contains no products.');
  if(existing.length+products.length>50)throw Error('Import would exceed 50 products. Remove unused products first.');
  const names=new Set(existing.map(p=>p.name));
  return products.map(p=>{
    let name=p.name,n=2;while(names.has(name))name=p.name.slice(0,70)+' ('+(n++)+')';names.add(name);
    return {...p,id:newId(),name};
  });
}
function exportProducts(all=false){
  const products=all?studio.products:[currentProduct()].filter(Boolean);if(!products.length)return;
  try{
    const json=JSON.stringify(productBundle(products),null,2);
    if(new Blob([json]).size>8000000)throw Error('This library exceeds 8 MB. Export products individually instead.');
    const name=all?'product-library':(products[0].name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'product');
    downloadFile(name+'.products.json',json,'application/json');
    $('#productTransferStatus').textContent=`Exported ${products.length} product${products.length===1?'':'s'}, including images.`;
  }catch(error){$('#productTransferStatus').textContent=error.message;}
}
$('#exportProduct').onclick=()=>exportProducts();
$('#exportProductLibrary').onclick=()=>exportProducts(true);
$('#importProducts').onclick=()=>$('#productsFile').click();
$('#productsFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>8000000)throw Error('Product files may be up to 8 MB.');
    const products=importedProducts(JSON.parse(await file.text()),studio.products);
    studio.products.push(...products);productUI();$('#productSelect').value=products[0].id;productUI();checkpoint();
    $('#productTransferStatus').textContent=`Imported ${products.length} product${products.length===1?'':'s'}. Drag a product card onto a shelf to place it. Undo removes this import.`;
  }catch(error){$('#productTransferStatus').textContent='Import failed: '+error.message;}
  finally{e.target.value='';}
};
function packProduct(G,s,p){return ProductPlacement.pack(G,s,p);}
function productUI(){
  const select=$('#productSelect'),old=select.value;select.innerHTML=studio.products.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');if(studio.products.some(p=>p.id===old))select.value=old;
  const product=currentProduct();$('#productFields').hidden=!product;
  for(const id of ['assignProduct','deleteProduct','exportProduct'])$('#'+id).disabled=!product;
  if(product){for(const [key,id] of Object.entries({name:'productName',width:'productWidth',height:'productHeight',depth:'productDepth',gap:'productGap',quantity:'productQuantity'}))$('#'+id).value=product[key];$('#productImagePreview').hidden=!product.image;$('#productImagePreview').src=product.image||'';$('#clearImage').disabled=!product.image;}
  $('#exportProductLibrary').disabled=!studio.products.length;
  syncSelection();
}
function syncSelection(){
  window.setOrbitTray?.(editor.selected);
  const G=currentGeometry;$('#productTray').innerHTML=G.trays.map((s,i)=>`<option value="${i}">Tray ${i+1}${s.t.placements?' · '+s.t.placements.length+' items':s.t.productId?' · '+escapeHTML(studio.products.find(p=>p.id===s.t.productId)?.name||'Product'):''}</option>`).join('');$('#productTray').value=editor.selected;
  const s=G.trays[editor.selected],p=studio.products.find(p=>p.id===s.t.productId);$('#clearProduct').disabled=!(p||s.t.placements?.length);
  if(s.t.placements){const types=new Set(s.t.placements.map(item=>item.productId));$('#productSummary').textContent=`Tray ${editor.selected+1}: ${s.t.placements.length} individually placed products · ${types.size} product types. Drag items to arrange them.`;}
  else if(p){const packing=packProduct(G,s,p);$('#productSummary').textContent=`Tray ${editor.selected+1}: ${p.name} · ${packing.columns} across × ${packing.rows} deep · ${packing.count} placed${p.quantity?' of '+p.quantity+' requested':''}. Usable area: ${packing.width.toFixed(1)} × ${packing.depth.toFixed(1)} mm.`;}
  else $('#productSummary').textContent='No product assigned to this tray. Create or choose a product, then place it.';
  const debug=window.previewDebug;if(debug)debug.parts.forEach(mesh=>{const selected=mesh.userData.part.tray===editor.selected;mesh.children.filter(o=>o.isLineSegments).forEach(o=>{o.material.color.set(selected?'#e39a31':'#4a3d30');o.material.opacity=selected?1:($('#xrayView').checked?.8:.18);});});
  $('#partTray').value=editor.selected;drawPartsViewer(G);
}
$('#productSelect').onchange=productUI;
$('#productTray').onchange=e=>selectLayer(Number(e.target.value));
$('#newProduct').onclick=()=>{if(studio.products.length>=50){toast('Maximum 50 products');return;}studio.products.push({id:crypto.randomUUID(),name:'New product',width:60,height:90,depth:1,gap:2,quantity:0,image:''});productUI();$('#productSelect').value=studio.products.at(-1).id;productUI();checkpoint();};
$('#deleteProduct').onclick=()=>{const p=currentProduct();if(!p)return;studio.products=studio.products.filter(x=>x!==p);S.trays.forEach(t=>{if(t.productId===p.id)delete t.productId;if(t.placements)t.placements=t.placements.filter(item=>item.productId!==p.id);});render();productUI();};
$('#assignProduct').onclick=()=>{const p=currentProduct();if(!p)return;const tray=S.trays[isolateLayer()];delete tray.placements;tray.productId=p.id;ui();render();};
$('#clearProduct').onclick=()=>{const tray=S.trays[isolateLayer()];delete tray.productId;delete tray.placements;ui();render();};
for(const [id,key] of Object.entries({productName:'name',productWidth:'width',productHeight:'height',productDepth:'depth',productGap:'gap',productQuantity:'quantity'}))$('#'+id).oninput=e=>{const p=currentProduct();if(!p)return;if(!e.target.checkValidity()||(key!=='name'&&e.target.value==='')){return;}p[key]=key==='name'?e.target.value.trim()||'Product':Number(e.target.value);render();const option=$('#productSelect').selectedOptions[0];if(option)option.textContent=p.name;};
$('#clearImage').onclick=()=>{const p=currentProduct();if(p){p.image='';render();productUI();}};
$('#productImage').onchange=async e=>{
  const file=e.target.files[0],p=currentProduct();if(!file||!p)return;
  try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12000000)throw Error('Choose a PNG, JPEG or WebP image up to 12 MB.');
    const bitmap=await createImageBitmap(file),scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height)),surface=document.createElement('canvas');surface.width=Math.max(1,Math.round(bitmap.width*scale));surface.height=Math.max(1,Math.round(bitmap.height*scale));surface.getContext('2d').drawImage(bitmap,0,0,surface.width,surface.height);bitmap.close();
    p.image=surface.toDataURL('image/webp',.85);render();productUI();
  }catch(error){toast(error.message);}finally{e.target.value='';}
};
function productImageMaterial(texture){return new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.FrontSide,depthWrite:false,alphaTest:.01,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});}
function clearProducts3D(){if(!studio.productGroup)return;studio.productGroup.parent?.remove(studio.productGroup);studio.productGroup.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});studio.productGroup=null;}
function renderProducts(){
  clearProducts3D();const debug=window.previewDebug;if(!debug)return;
  const group=new THREE.Group();studio.productGroup=group;debug.scene.add(group);let shown=0;
  currentGeometry.trays.forEach(s=>{
    const items=ProductPlacement.items(currentGeometry,s,studio.products).slice(0,Math.max(0,500-shown));shown+=items.length;
    for(const item of items){
      const p=studio.products.find(p=>p.id===item.productId);if(!p)continue;
      const d=item.z,h=currentGeometry.thick/2+p.height/2;
      const object=new THREE.Group();object.position.set(item.x,s.floorRear.y+Math.sin(s.a)*d+Math.cos(s.a)*h,s.floorRear.x+Math.cos(s.a)*d-Math.sin(s.a)*h);object.rotation.x=-s.a;object.userData={tray:s.i,placementId:item.id,productId:p.id};
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.width,p.height,p.depth),new THREE.MeshStandardMaterial({color:p.image?'#f8f5ed':'#d49b72',roughness:.8}));mesh.userData={...object.userData};object.add(mesh);
      if(p.image){
        let texture=studio.textures.get(p.image);if(!texture){texture=new THREE.TextureLoader().load(p.image,()=>{if(studio.products.some(item=>item.image===p.image))renderProducts();});texture.colorSpace=THREE.SRGBColorSpace;studio.textures.set(p.image,texture);}
        const aspect=texture.image?texture.image.width/texture.image.height:p.width/p.height,w=Math.min(p.width,p.height*aspect),h=Math.min(p.height,p.width/aspect);
        const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),productImageMaterial(texture));face.position.z=p.depth/2+.03;face.userData={...object.userData};object.add(face);
      }
      group.add(object);
    }
  });
  for(const [src,texture] of studio.textures)if(!studio.products.some(p=>p.image===src)){texture.dispose();studio.textures.delete(src);}
  group.visible=Number($('#explodeAmount').value)<.001;window.highlightPlacedProduct?.();
}
const originalPositionEditor=positionEditor3D;positionEditor3D=function(){originalPositionEditor();if(studio.productGroup)studio.productGroup.visible=Number($('#explodeAmount').value)<.001;};window.positionEditor3D=positionEditor3D;
const originalSelect=selectLayer;selectLayer=function(i){originalSelect(i);syncSelection();document.querySelector('.tray.selected')?.scrollIntoView({block:'nearest',behavior:'smooth'});};
if(window.previewDebug){
  const surface=previewDebug.renderer.domElement;let start=null;
  surface.addEventListener('pointerdown',e=>{start=e.button===0&&!e.shiftKey&&!e.altKey?{x:e.clientX,y:e.clientY,id:e.pointerId}:null;});
  surface.addEventListener('pointercancel',()=>start=null);
  surface.addEventListener('pointerup',e=>{if(!start||start.id!==e.pointerId)return;const distance=Math.hypot(e.clientX-start.x,e.clientY-start.y);start=null;if(distance>5)return;
    const rect=surface.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),previewDebug.camera);
    previewDebug.root.updateMatrixWorld(true);studio.productGroup?.updateMatrixWorld(true);
    const hits=ray.intersectObjects([...previewDebug.parts,...(studio.productGroup?.visible?studio.productGroup.children:[])],true).filter(h=>h.object.isMesh);
    if(hits.length){let object=hits[0].object;while(object&&object.userData.tray===undefined&&!object.userData.part)object=object.parent;const tray=object?.userData.part?.tray??object?.userData.tray;if(tray!==undefined)selectLayer(tray);}
  });
}

const originalBuildModel=buildModel;
buildModel=function(G){const model=originalBuildModel(G);if(studio.fabrication.relief){model.side=Fabrication.relief(model.side,studio.fabrication.relief);model.parts.forEach(p=>p.contours=Fabrication.relief(p.contours,studio.fabrication.relief));}return model;};
function adjustRearWallToMatch(index,height){
  if(!Number.isFinite(height)||height<=0||height>1000)return;
  const tray=isolatePlacementTray(index);tray.wall=Math.max(tray.wall,height);
  editor.selected=index;studio.editSession=null;ui();render();
}
function designChecks(G){
  const issues=[],add=(message,tray=null,severity='warning',product=false,wallHeight=null)=>issues.push({message,tray,severity,product,wallHeight});
  if(G.model.side.length!==1)add(`Side panel has ${G.model.side.length} separate regions. Adjust tray angles, spacing or relief.` ,null,'error');
  G.model.parts.forEach(p=>{if(p.contours.length!==1)add(`${p.name} is split or empty. Reduce relief or revise its dimensions.`,p.tray,'error');});
  G.joints.forEach(j=>{if(j.total<G.thick)add(`${j.kind==='front'?'Front':'Rear'} wall on tray ${j.tray+1} has only ${j.total.toFixed(1)} mm of joint engagement.`,j.tray);});
  G.trays.forEach((s,i)=>{
    if(i&&s.t.frontHeight>G.trays[i-1].t.wall)add(`Tray ${i+1} spacing exceeds the previous wall height; its position is clamped.`,i,'error');
    if(s.t.placements){let reported=0;const tall=new Set();for(const item of s.t.placements){const p=studio.products.find(p=>p.id===item.productId);if(!p)continue;if(p.height>s.t.wall&&!tall.has(p.id)){tall.add(p.id);add(`${p.name} extends ${(p.height-s.t.wall).toFixed(1)} mm above tray ${i+1}'s rear wall.`,i,'warning',true,p.height);}const reason=ProductPlacement.valid(G,s,p,item,s.t.placements,studio.products,item.id);if(reason&&reported++<3)add(`${p.name} on tray ${i+1}: ${reason.toLowerCase()}.`,i,'error',true);}}
    const p=studio.products.find(p=>p.id===s.t.productId);if(p){const fit=packProduct(G,s,p);if(!fit.capacity)add(`${p.name} does not fit tray ${i+1}'s usable width or depth.`,i,'error',true);else if(p.quantity>fit.capacity)add(`Tray ${i+1} fits ${fit.capacity} ${p.name}; ${p.quantity} requested.`,i);if(p.height>s.t.wall)add(`${p.name} extends ${(p.height-s.t.wall).toFixed(1)} mm above tray ${i+1}'s rear wall.`,i,'warning',true,p.height);if(fit.count>500)add(`Tray ${i+1} holds ${fit.count} products; the preview draws up to 500 products in total.`,i);}
  });
  // Long parts share the width axis. Positive-area intersection in side view
  // therefore identifies physical interference, excluding edge-only contact.
  const outlines=G.model.parts.map(p=>{const d=p.direction,a={x:p.center.x-d.x*p.length/2,y:p.center.y-d.y*p.length/2},b={x:p.center.x+d.x*p.length/2,y:p.center.y+d.y*p.length/2};return {p,ring:[rectAround(a,b,G.thick).map(v=>[v.x,v.y])]};});
  let collisions=0;
  for(let i=0;i<outlines.length;i++)for(let j=i+1;j<outlines.length;j++){
    const a=outlines[i],b=outlines[j],boundsA=Fabrication.bounds([a.ring]),boundsB=Fabrication.bounds([b.ring]);
    if(boundsA.maxX<=boundsB.minX+1e-5||boundsB.maxX<=boundsA.minX+1e-5||boundsA.maxY<=boundsB.minY+1e-5||boundsB.maxY<=boundsA.minY+1e-5)continue;
    const overlap=polygonClipping.intersection(a.ring,b.ring),area=overlap.reduce((sum,poly)=>sum+Math.abs(Fabrication.area(poly[0]))-poly.slice(1).reduce((n,r)=>n+Math.abs(Fabrication.area(r)),0),0);
    if(area>.01){if(collisions<8)add(`${a.p.name} intersects ${b.p.name}.`,b.p.tray,'error');collisions++;}
  }
  if(collisions>8)add(`${collisions-8} additional part intersections.`,null,'error');
  if(studio.fabrication.relief>G.thick)add('Corner relief is wider than the material thickness; inspect the remaining material around the joints.');
  studio.issues=issues;$('#designChecks').innerHTML=issues.length?issues.map((issue,i)=>`<li class="${issue.severity}">${escapeHTML(issue.message)}${issue.tray!==null?` <button data-issue="${i}">Show tray ${issue.tray+1}</button>${issue.wallHeight!==null?` <button data-adjust-wall="${i}">Adjust rear wall to match</button>`:''}`:''}</li>`).join(''):'<li class="ok">No issues found by the current geometry and product-fit checks.</li>';
  $('#designChecks').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>selectLayer(issues[Number(b.dataset.issue)].tray));
  $('#designChecks').querySelectorAll('[data-adjust-wall]').forEach(b=>b.onclick=()=>{const issue=issues[Number(b.dataset.adjustWall)];adjustRearWallToMatch(issue.tray,issue.wallHeight);});
}
function fabricationParts(){return [{name:'Left side panel',contours:currentGeometry.model.side},{name:'Right side panel',contours:currentGeometry.model.side},...currentGeometry.model.parts.map(p=>({name:p.name,contours:p.contours}))];}
function downloadFile(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cuttingSheet(){if(studio.issues.some(i=>i.severity==='error'&&!i.product))throw Error('Resolve the red design checks before exporting cutting paths.');return Fabrication.layout(fabricationParts(),studio.fabrication.kerf);}
function showCutPreview(sheet){const xml=Fabrication.svg(sheet,`Millimetres; kerf ${studio.fabrication.kerf} mm; corner relief ${studio.fabrication.relief} mm.`);$('#cutPreview').innerHTML=xml;const svg=$('#cutPreview svg');svg.classList.add('exportPreview');sheet.items.forEach(p=>{const text=document.createElementNS(NS,'text');text.setAttribute('x',p.labelX);text.setAttribute('y',p.labelY);text.setAttribute('font-size','3');text.textContent=p.name;svg.appendChild(text);});$('#fabricationStatus').textContent=`${sheet.items.length} parts · ${sheet.width.toFixed(1)} × ${sheet.height.toFixed(1)} mm cutting layout · ${studio.fabrication.kerf} mm kerf.`;return xml;}
async function fabricate(format){const panel=$('#fabricationPanel');panel.classList.add('fabricationBusy');$('#fabricationStatus').textContent='Preparing cutting paths…';await new Promise(requestAnimationFrame);try{const sheet=cuttingSheet(),xml=showCutPreview(sheet);if(format==='svg')downloadFile('display-stand-cut.svg',xml,'image/svg+xml');if(format==='dxf')downloadFile('display-stand-cut.dxf',Fabrication.dxf(sheet),'application/dxf');}catch(error){$('#fabricationStatus').textContent=error.message;}finally{panel.classList.remove('fabricationBusy');}}
$('#previewCuts').onclick=()=>fabricate();$('#exportSVG').onclick=()=>fabricate('svg');$('#exportDXF').onclick=()=>fabricate('dxf');
$('#exportPartsList').onclick=()=>{const rows=[['Part','Quantity','Width mm','Height mm','Material mm','Kerf mm','Relief mm'],...fabricationParts().map(p=>{const b=Fabrication.bounds(p.contours);return [p.name,1,(b.maxX-b.minX).toFixed(3),(b.maxY-b.minY).toFixed(3),currentGeometry.thick,studio.fabrication.kerf,studio.fabrication.relief];})];downloadFile('display-stand-parts.csv',rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv');};
for(const key of ['kerf','relief'])$('#'+key).oninput=e=>{if(!e.target.checkValidity()){return;}const before=studio.fabrication[key];studio.fabrication[key]=Number(e.target.value);try{render();}catch(error){studio.fabrication[key]=before;e.target.value=before;render();toast('Could not generate those relief cuts. Try a smaller diameter.');}};
const originalRender=render;render=function(){if(!studio.restoring&&S.trays.reduce((n,t)=>n+t.count,0)>100){restore(JSON.parse(studio.snapshot));toast('Maximum 100 physical trays per project.');return;}originalRender();renderProducts();syncSelection();designChecks(currentGeometry);$('#cutPreview').innerHTML='';$('#fabricationStatus').textContent='Design changed — generate a fresh cutting preview.';checkpoint();};
for(const id of ['showDimensions','snapEnabled','snapSize','linkedEdit','xrayView'])$('#'+id).addEventListener('change',checkpoint);
// Replace the early direct listener references so global edits use the project pipeline.
for(const [id,[min,max]] of Object.entries(settingRanges)){
  const field=$('#'+id);field.min=min;field.max=max;field.removeEventListener('input',originalRender);field.addEventListener('input',()=>{if(field.checkValidity()&&field.value!=='')render();});field.addEventListener('change',()=>{if(!field.checkValidity()||field.value===''){field.value=JSON.parse(studio.snapshot).settings[id];toast('Enter a value between '+min+' and '+max+'.');}});
}
// The original application initializes before these optional studio features.
studio.snapshot=JSON.stringify(configuration());
try{const saved=localStorage.getItem(SAVE_KEY);if(saved){restore(validateProject(JSON.parse(saved)));studio.snapshot=JSON.stringify(configuration());$('#saveState').textContent='Recovered saved design';}else{render();productUI();}}catch(error){render();productUI();$('#saveState').textContent='Saved design could not be recovered: '+error.message;}
historyButtons();
