/* Direct shelf stocking with pointer events: mouse, pen and touch. */
'use strict';
const arranger={selection:null,drag:null,ghost:null,floorGhost:null,paletteKey:null};
const stage=document.createElement('div');stage.className='productStage';
$('#threeView').before(stage);stage.appendChild($('#threeView'));
$('#threeView').insertAdjacentHTML('beforeend','<div id="stockHud" class="stockHud">Pick a product and stock a shelf</div>');
stage.insertAdjacentHTML('beforeend',`<section class="stockPalette" aria-label="Product palette"><div class="eyebrow">STOCK THE SHELVES</div><h2>Pick a product</h2><p>Drag onto a shelf.<br>Click to add one to the selected tray.</p><div id="stockCards"></div><button id="editProductLibrary">+ Create a product</button></section>`);
$('#threeView').insertAdjacentHTML('beforeend','<div id="stockBin" class="stockBin" aria-label="Drop item in trash" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Trash</span></div>');
document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="product-arranger.css">');
$('#assignProduct').textContent='Auto-fill tray with this product';
$('#productsPanel > p').textContent='Create products here, then drag their cards onto the 3D shelves to mix and match. Auto-fill replaces the selected tray with rows of one product.';
$('#editProductLibrary').onclick=()=>{$('#newProduct').click();$('#productsPanel').scrollIntoView({behavior:'smooth',block:'start'});$('#productName').focus();$('#productName').select();};
function trayItems(i){const tray=currentGeometry.trays[i];return tray?ProductPlacement.items(currentGeometry,tray,studio.products):[];}
function selectedItem(){const selected=arranger.selection;if(!selected)return null;const item=trayItems(selected.tray).find(item=>item.id===selected.id);return item?{...selected,item,product:studio.products.find(p=>p.id===item.productId)}:null;}
function setItemSelection(tray,id){arranger.selection={tray,id};selectLayer(tray);refreshStocking();}
function isolatePlacementTray(i){
  let first=0;
  for(let index=0;index<S.trays.length;index++){
    const group=S.trays[index];if(i>=first+group.count){first+=group.count;continue;}
    if(group.count===1)return group;
    const before=i-first,after=group.count-before-1,selected=makeTray(group,{count:1}),split=[];
    if(before)split.push(makeTray(group,{count:before}));split.push(selected);if(after)split.push(makeTray(group,{count:after}));S.trays.splice(index,1,...split);return selected;
  }
  throw Error('Tray no longer exists.');
}
function canMaterialize(i){const s=currentGeometry.trays[i],p=studio.products.find(p=>p.id===s.t.productId);return !p||Array.isArray(s.t.placements)||packProduct(currentGeometry,s,p).count<=500;}
function commitPlacement(product,position,target,source=null){
  if(!canMaterialize(target)||(source&&!canMaterialize(source.tray))){sayPlacement('Reduce the auto-fill quantity to 500 or fewer before moving these items.');return false;}
  const items=trayItems(target),ignore=source?.tray===target?source.id:null;
  const reason=ProductPlacement.valid(currentGeometry,currentGeometry.trays[target],product,position,items,studio.products,ignore);
  if(reason){sayPlacement(reason+'. Try an empty spot.');return false;}
  if(items.length>=500&&!ignore){sayPlacement('This tray already has 500 items.');return false;}
  const old=source?trayItems(source.tray):null;
  const original=old?.find(item=>item.id===source.id);
  if(source&&!original)return false;
  if(source?.tray===target&&Math.abs(original.x-position.x)<1e-6&&Math.abs(original.z-position.z)<1e-6){setItemSelection(target,source.id);return true;}
  const id=source?.tray===target?source.id:crypto.randomUUID();
  const next=items.filter(item=>item.id!==ignore).concat([{id,productId:product.id,x:position.x,z:position.z}]);
  if(source&&source.tray!==target){const tray=isolatePlacementTray(source.tray);tray.placements=old.filter(item=>item.id!==source.id);delete tray.productId;}
  const tray=isolatePlacementTray(target);tray.placements=next;delete tray.productId;
  editor.selected=target;arranger.selection={tray:target,id};studio.editSession=null;ui();render();
  sayPlacement(`${product.name} ${source?'moved':'stocked'} on tray ${target+1}.`);
  const object=studio.productGroup?.children.find(o=>o.userData.tray===target&&o.userData.placementId===id);
  if(object&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const start=performance.now();const animate=now=>{if(!object.parent)return;const t=Math.min(1,(now-start)/220);object.scale.setScalar(1+Math.sin(t*Math.PI)*.05);if(t<1)requestAnimationFrame(animate);};requestAnimationFrame(animate);}
  return true;
}
function addOne(product){
  const tray=editor.selected,items=trayItems(tray),position=ProductPlacement.firstSpace(currentGeometry,currentGeometry.trays[tray],product,items,studio.products);
  if(!position){sayPlacement(`No free space for ${product.name} on tray ${tray+1}. Try another shelf.`);return;}
  commitPlacement(product,position,tray);
}
function removeSelectedItem(){const selected=selectedItem();if(!selected)return;if(!canMaterialize(selected.tray)){sayPlacement('Reduce the auto-fill quantity to 500 or fewer first.');return;}const items=trayItems(selected.tray).filter(item=>item.id!==selected.id),tray=isolatePlacementTray(selected.tray);tray.placements=items;delete tray.productId;arranger.selection=null;studio.editSession=null;ui();render();sayPlacement('Item removed. Undo puts it back.');}
function sayPlacement(text){$('#stockHud').textContent=text;$('#stockHud').classList.toggle('holding',!!arranger.drag);}
function refreshStocking(){
  const paletteKey=JSON.stringify(studio.products);if(paletteKey!==arranger.paletteKey){
    arranger.paletteKey=paletteKey;$('#stockCards').innerHTML=studio.products.length?studio.products.map((p,i)=>`<button class="stockCard" data-product="${escapeHTML(p.id)}" aria-label="Add ${escapeHTML(p.name)} to selected tray"><span class="stockThumbnail" style="--product-color:${['#d7a273','#839bba','#9dab78','#c997ab'][i%4]}">${p.image?`<img src="${p.image}" alt="" draggable="false">`:'▤'}</span><span><b>${escapeHTML(p.name)}</b><small>${p.width} × ${p.height} × ${p.depth} mm</small></span><span class="stockPlus">+</span></button>`).join(''):'<p class="emptyStock">Your product box is empty. Create a product to start stocking.</p>';
    $('#stockCards').querySelectorAll('button').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=studio.products.find(p=>p.id===button.dataset.product);beginProductDrag(e,p,null,'palette');});
      button.addEventListener('click',e=>{if(e.detail===0){const p=studio.products.find(p=>p.id===button.dataset.product);addOne(p);}});
    });
  }
  if(arranger.selection?.tray!==editor.selected)arranger.selection=null;
  const selected=selectedItem();if(!selected)arranger.selection=null;
  const items=trayItems(editor.selected),types=new Set(items.map(item=>item.productId)).size;const count=`${items.length} item${items.length===1?'':'s'} · ${types} product type${types===1?'':'s'}`;
  if(!arranger.drag)$('#stockHud').textContent=`Tray ${editor.selected+1} · ${count} · drag products to stock it`;
  highlightPlacedProduct();
}
function highlightPlacedProduct(){
  studio.productGroup?.children.forEach(object=>{const chosen=arranger.selection?.tray===object.userData.tray&&arranger.selection?.id===object.userData.placementId;object.children.forEach(mesh=>{if(mesh.material?.emissive)mesh.material.emissive.set(chosen?'#3c5030':'#000000');});});
}
window.highlightPlacedProduct=highlightPlacedProduct;
function rayAt(x,y){const debug=window.previewDebug;if(!debug)return null;const r=debug.renderer.domElement.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return null;const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),debug.camera);return ray;}
function shelfPoint(x,y){
  const ray=rayAt(x,y);if(!ray)return null;previewDebug.root.updateMatrixWorld(true);
  const hit=ray.intersectObjects(previewDebug.parts,true).find(hit=>hit.object.isMesh&&hit.object.userData.part);
  if(!hit)return null;const i=hit.object.userData.part.tray,s=currentGeometry.trays[i];
  return {tray:i,x:hit.point.x,z:(hit.point.y-s.floorRear.y)*Math.sin(s.a)+(hit.point.z-s.floorRear.x)*Math.cos(s.a)};
}
function beginProductDrag(event,product,source,origin){
  if(!product||arranger.drag)return;if(Number($('#explodeAmount').value)>.001){sayPlacement('Assemble the stand before stocking its shelves.');return;}
  event.preventDefault();event.stopImmediatePropagation();studio.editSession=null;
  const start=origin==='scene'?shelfPoint(event.clientX,event.clientY):null;
  const item=source?trayItems(source.tray).find(item=>item.id===source.id):null;
  arranger.drag={product,source,origin,startX:event.clientX,startY:event.clientY,pointer:event.pointerId,moved:false,target:null,offset:start&&item?{x:start.x-item.x,z:start.z-item.z}:{x:0,z:0},capture:event.currentTarget};
  event.currentTarget.setPointerCapture?.(event.pointerId);if(source){arranger.selection=source;highlightPlacedProduct();}
  if(origin==='scene')event.currentTarget.focus({preventScroll:true});
  $('#stockBin').hidden=false;
  startHeldProduct(product,event.clientX,event.clientY);
  if(typeof orbit!=='undefined')orbit.drag=false;
  document.body.classList.add('stockDragging');sayPlacement(`Holding ${product.name} · drop onto a shelf · Esc cancels`);
}
function showGhost(product,target){
  clearGhost();if(!target)return;
  const debug=window.previewDebug;if(debug){
    const s=currentGeometry.trays[target.tray],color=target.reason?'#cf694f':'#58a46e',group=new THREE.Group(),h=currentGeometry.thick/2+product.height/2;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(product.width,product.height,product.depth),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.08,depthWrite:false}));group.add(mesh);group.position.set(target.x,s.floorRear.y+Math.sin(s.a)*target.z+Math.cos(s.a)*h,s.floorRear.x+Math.cos(s.a)*target.z-Math.sin(s.a)*h);group.rotation.x=-s.a;debug.scene.add(group);arranger.ghost=group;
    const floor=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,2*currentGeometry.model.sideX-currentGeometry.thick),.5,s.t.depth),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false}));floor.rotation.x=-s.a;const d=s.t.depth/2,n=currentGeometry.thick/2+.3;floor.position.set(0,s.floorRear.y+Math.sin(s.a)*d+Math.cos(s.a)*n,s.floorRear.x+Math.cos(s.a)*d-Math.sin(s.a)*n);debug.scene.add(floor);arranger.floorGhost=floor;
  }
}
function clearGhost(){for(const key of ['ghost','floorGhost']){const object=arranger[key];if(object){object.parent?.remove(object);object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});arranger[key]=null;}}}
let dragFrame=0;
function moveProductDrag(event){
  const drag=arranger.drag;if(!drag||event.pointerId!==drag.pointer)return;
  moveHeldProduct(event.clientX,event.clientY);
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5&&!drag.moved)return;drag.moved=true;
  if(heldState&&drag.source&&!heldState.sourceObject){heldState.sourceObject=studio.productGroup?.children.find(o=>o.userData.tray===drag.source.tray&&o.userData.placementId===drag.source.id);if(heldState.sourceObject)heldState.sourceObject.visible=false;}
  const bin=$('#stockBin').getBoundingClientRect();drag.trash=event.clientX>=bin.left&&event.clientX<=bin.right&&event.clientY>=bin.top&&event.clientY<=bin.bottom;
  $('#stockBin').classList.toggle('dropReady',drag.trash);
  if(drag.trash){drag.target=null;clearGhost();sayPlacement(drag.source?'Release to remove this item · Undo brings it back':'Release to discard this unplaced product');return;}
  const point=shelfPoint(event.clientX,event.clientY);
  if(!point){drag.target=null;clearGhost();sayPlacement('Move over a shelf to place this item.');return;}
  const offset=drag.source?.tray===point.tray?drag.offset:{x:0,z:0};
  const result=ProductPlacement.candidate(currentGeometry,currentGeometry.trays[point.tray],drag.product,{x:point.x-offset.x,z:point.z-offset.z},trayItems(point.tray),studio.products,drag.source?.tray===point.tray?drag.source.id:null,event.shiftKey||!$('#snapEnabled').checked?0:Number($('#snapSize').value));
  drag.target={...result,tray:point.tray};sayPlacement(result.reason?`${result.reason} · try an empty spot`:`Release to ${drag.source?'move':'stock'} ${drag.product.name} on tray ${point.tray+1}`);
  if(!dragFrame)dragFrame=requestAnimationFrame(()=>{dragFrame=0;if(arranger.drag)showGhost(drag.product,drag.target);});
}
function finishProductDrag(cancel=false){
  const drag=arranger.drag;if(!drag)return;arranger.drag=null;if(dragFrame)cancelAnimationFrame(dragFrame);dragFrame=0;clearGhost();document.body.classList.remove('stockDragging');
  stopHeldProduct();$('#stockBin').classList.remove('dropReady');$('#stockBin').hidden=true;
  if(drag.capture.hasPointerCapture?.(drag.pointer))drag.capture.releasePointerCapture(drag.pointer);
  if(cancel){refreshStocking();sayPlacement('Placement cancelled.');return;}
  if(drag.trash){if(drag.source){arranger.selection=drag.source;removeSelectedItem();}else sayPlacement('Unplaced product discarded.');return;}
  if(!drag.moved){if(drag.source)setItemSelection(drag.source.tray,drag.source.id);else addOne(drag.product);return;}
  if(drag.target&&!drag.target.reason)commitPlacement(drag.product,drag.target,drag.target.tray,drag.source);
  else {refreshStocking();sayPlacement('Not placed — drop inside a shelf with enough free space.');}
}
window.addEventListener('pointermove',moveProductDrag);
window.addEventListener('pointerup',e=>{if(arranger.drag?.pointer===e.pointerId)finishProductDrag();});
window.addEventListener('pointercancel',()=>finishProductDrag(true));
window.addEventListener('blur',()=>finishProductDrag(true));
window.addEventListener('keydown',e=>{if(arranger.drag&&(e.key==='Escape'||((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())))){e.preventDefault();e.stopImmediatePropagation();finishProductDrag(true);}},true);
window.addEventListener('keydown',e=>{if(!arranger.drag&&!e.defaultPrevented&&['Delete','Backspace'].includes(e.key)&&!e.target.closest('input,textarea,select,[contenteditable="true"]')&&selectedItem()){e.preventDefault();removeSelectedItem();}});
if(window.previewDebug){
  const canvas=previewDebug.renderer.domElement;
  canvas.tabIndex=0;canvas.setAttribute('aria-label','3D shelves: click a product to select, drag to move, Delete to remove');
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.shiftKey||e.altKey||Number($('#explodeAmount').value)>.001)return;const ray=rayAt(e.clientX,e.clientY);studio.productGroup?.updateMatrixWorld(true);const hit=ray?.intersectObjects(studio.productGroup?.children||[],true).find(hit=>hit.object.isMesh&&hit.object.userData.placementId);if(hit){const data=hit.object.userData,p=studio.products.find(p=>p.id===data.productId);beginProductDrag(e,p,{tray:data.tray,id:data.placementId},'scene');}},true);
}
const stockingSync=syncSelection;syncSelection=function(){stockingSync();if(!arranger.drag)refreshStocking();};
const stockingProductUI=productUI;productUI=function(){stockingProductUI();refreshStocking();};
// Product selection and restored history use the same palette/scene update path.
$('#productSelect').onchange=productUI;

// Held items use the shelf scene and camera, in real millimetres.
let heldFrame=0,heldState=null;
function heldMotionStep(state,dx,dt,reduced){
  if(reduced){state.angle=0;state.velocity=0;return;}
  const target=Math.max(-.5,Math.min(.5,-dx*.015*.016/Math.max(dt,.001)));
  state.velocity+=(target-state.angle)*65*dt;state.velocity*=Math.exp(-7*dt);
  state.angle=Math.max(-.65,Math.min(.65,state.angle+state.velocity*dt));
}
function heldPose(G,target,product){
  const tray=G.trays[target.tray],height=G.thick/2+product.height+8;
  return {x:target.x,y:tray.floorRear.y+Math.sin(tray.a)*target.z+Math.cos(tray.a)*height,z:tray.floorRear.x+Math.cos(tray.a)*target.z-Math.sin(tray.a)*height,angle:-tray.a};
}
function startHeldProduct(product,x,y){
  stopHeldProduct();const debug=window.previewDebug;if(!debug)return;
  const root=new THREE.Group(),width=product.width,height=product.height,depth=product.depth;
  heldState={root,product,x,y,lastX:x,angle:0,velocity:0,time:performance.now(),start:performance.now(),ownedTexture:null,scene:debug.scene,depth:null,sceneAngle:-currentGeometry.trays[arranger.drag?.source?.tray??editor.selected].a};
  const body=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color:product.image?'#fff9ed':'#d7a273',roughness:.7}));body.position.y=-8-height/2;root.add(body);
  if(product.image){
    let face,texture=studio.textures.get(product.image);
    if(!texture){texture=new THREE.TextureLoader().load(product.image,loaded=>{if(heldState?.root!==root||!face)return;const ratio=loaded.image.width/loaded.image.height;face.geometry.dispose();face.geometry=new THREE.PlaneGeometry(Math.min(width,height*ratio),Math.min(height,width/ratio));});texture.colorSpace=THREE.SRGBColorSpace;heldState.ownedTexture=texture;}
    const ratio=texture.image?texture.image.width/texture.image.height:width/height;
    face=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width,height*ratio),Math.min(height,width/ratio)),productImageMaterial(texture));face.position.set(0,-8-height/2,depth/2+.03);root.add(face);
  }
  const cord=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,-8,0)]),new THREE.LineBasicMaterial({color:'#365443',transparent:true,opacity:.5}));root.add(cord);
  debug.scene.add(root);
  function animate(now){
    const state=heldState;if(!state)return;
    const dt=Math.min(.04,Math.max(.001,(now-state.time)/1000)),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    heldMotionStep(state,state.x-state.lastX,dt,reduced);state.lastX=state.x;state.time=now;
    const target=arranger.drag?.target,rect=debug.renderer.domElement.getBoundingClientRect();
    if(target){
      const pose=heldPose(currentGeometry,target,product);root.position.set(pose.x,pose.y,pose.z);root.rotation.set(pose.angle,0,0);state.sceneAngle=pose.angle;
      state.depth=root.position.clone().project(debug.camera).z;
    }else{
      if(state.depth===null){const tray=arranger.drag?.source?.tray??editor.selected,item=arranger.drag?.source?trayItems(tray).find(i=>i.id===arranger.drag.source.id):null;const pose=heldPose(currentGeometry,{tray,x:item?.x??0,z:item?.z??currentGeometry.trays[tray].t.depth/2},product);state.depth=new THREE.Vector3(pose.x,pose.y,pose.z).project(debug.camera).z;}
      root.position.copy(new THREE.Vector3((state.x-rect.left)/rect.width*2-1,-(state.y-rect.top)/rect.height*2+1,state.depth).unproject(debug.camera));
      root.rotation.set(state.sceneAngle,0,0);
    }
    // Small motion is superimposed on the actual landing pose; at rest it matches it.
    if(!reduced)root.rotateZ(state.angle*.2);
    root.visible=state.x>=rect.left&&state.x<=rect.right&&state.y>=rect.top&&state.y<=rect.bottom;
    heldFrame=requestAnimationFrame(animate);
  }
  animate(performance.now());
}
function moveHeldProduct(x,y){if(heldState){heldState.x=x;heldState.y=y;}}
function stopHeldProduct(){
  if(heldFrame)cancelAnimationFrame(heldFrame);heldFrame=0;
  if(heldState){const state=heldState;if(state.sourceObject)state.sourceObject.visible=true;state.scene.remove(state.root);state.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});state.ownedTexture?.dispose();heldState=null;}
}

refreshStocking();
