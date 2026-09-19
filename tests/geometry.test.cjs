const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function fixture(){
  const values={mat:3,partLength:300,frontGrip:20,toeExtra:10,rearExtra:10,sideRadius:6,frontHeightDefault:30,extDefault:20};
  const context=vm.createContext({console,navigator:{userAgent:'node'},document:{querySelector:s=>({value:values[s.slice(1)]})}});
  vm.runInContext('globalThis.window=globalThis;',context);
  vm.runInContext(scripts.find(s=>s.includes('polygonClipping=e()')),context);
  const app=scripts.find(s=>s.includes('const DEFAULT_TRAY_1='));
  vm.runInContext(app.slice(0,app.indexOf('$("#add").onclick')),context);
  vm.runInContext(fs.readFileSync('vendor/clipper.js','utf8'),context);
  vm.runInContext(fs.readFileSync('manufacturing.js','utf8'),context);
  vm.runInContext(fs.readFileSync('product-placement.js','utf8'),context);
  return {context,run:s=>vm.runInContext(s,context)};
}
test('default stand has connected parts and two physical side panels in export',()=>{
  const {run}=fixture();const result=run(`(()=>{const G=solve();G.model=buildModel(G);const parts=[{name:'Left side',contours:G.model.side},{name:'Right side',contours:G.model.side},...G.model.parts];const sheet=Fabrication.layout(parts,0);return {trays:G.trays.length,parts:parts.length,connected:parts.every(p=>p.contours.length===1),svg:Fabrication.svg(sheet,'test'),dxf:Fabrication.dxf(sheet)};})()`);
  assert.equal(result.trays,6);assert.equal(result.parts,15);assert.ok(result.connected);
  assert.equal((result.svg.match(/<path /g)||[]).length,15);assert.match(result.svg,/width="[\d.]+mm"/);assert.doesNotMatch(result.svg,/<text/);
  assert.match(result.dxf,/\$INSUNITS\r\n70\r\n4/);assert.equal((result.dxf.match(/LWPOLYLINE/g)||[]).length,15);
});
test('kerf expands external dimensions and shrinks holes by the full kerf width',()=>{
  const {run}=fixture();const result=run(`(()=>{const part=[[[[0,0],[100,0],[100,60],[0,60],[0,0]],[[20,20],[20,40],[40,40],[40,20],[20,20]]]];const cut=Fabrication.compensate(part,.2);return {outer:Fabrication.bounds(cut),hole:Fabrication.bounds([[cut[0][1]]])};})()`);
  assert.ok(Math.abs(result.outer.minX+.1)<1e-6);assert.ok(Math.abs(result.outer.maxX-100.1)<1e-6);
  assert.ok(Math.abs(result.hole.minX-20.1)<1e-6);assert.ok(Math.abs(result.hole.maxX-39.9)<1e-6);
});
test('circular relief removes material at concave corners, leaving exterior bounds unchanged',()=>{
  const {run}=fixture();const result=run(`(()=>{const part=[[[[0,0],[100,0],[100,60],[55,60],[55,30],[45,30],[45,60],[0,60],[0,0]]]];const relief=Fabrication.relief(part,2);return {before:Math.abs(Fabrication.area(part[0][0])),after:Math.abs(Fabrication.area(relief[0][0])),bounds:Fabrication.bounds(relief),count:relief.length};})()`);
  assert.equal(result.count,1);assert.ok(result.after<result.before-3);assert.equal(result.bounds.minX,0);assert.equal(result.bounds.maxX,100);
});
test('kerf and relief work together on the actual stand contours',()=>{
  const {run}=fixture();const result=run(`(()=>{const G=solve();G.model=buildModel(G);const contours=Fabrication.relief(G.model.side,1);const compensated=Fabrication.compensate(contours,.15);return {regions:compensated.length,finite:compensated.flat(3).every(Number.isFinite)};})()`);
  assert.equal(result.regions,1);assert.ok(result.finite);
});
test('product capacity uses side-panel clearance, physical depth, and requested quantity',()=>{
  const {run,context}=fixture(),source=fs.readFileSync('studio.js','utf8');
  vm.runInContext(source.slice(source.indexOf('function packProduct('),source.indexOf('function productUI(')),context);
  const result=run(`(()=>{const G=solve();G.model=buildModel(G);return packProduct(G,G.trays[0],{width:65,height:100,depth:1,gap:2,quantity:8});})()`);
  assert.equal(result.width,272);assert.equal(result.columns,4);assert.equal(result.rows,16);assert.equal(result.count,8);
  assert.equal(run(`(()=>{const G=solve();G.model=buildModel(G);return packProduct(G,G.trays[0],{width:500,height:100,depth:1,gap:2,quantity:8}).count;})()`),0);
});
test('project import rejects invalid numbers, unknown references, and non-image URLs',()=>{
  const {context,run}=fixture(),source=fs.readFileSync('studio.js','utf8');
  vm.runInContext(source.slice(source.indexOf('const settingRanges='),source.indexOf("$('#importProject').onclick")),context);
  run(`globalThis.project={schema:'display-stand-config',version:3,units:'mm',settings:{mat:3,frontHeightDefault:30,extDefault:20,partLength:300,frontGrip:20,toeExtra:10,sideRadius:6,rearExtra:10},trayGroups:[{depth:50,angle:10,wall:70,frontHeight:30,extend:20,count:1}]};`);
  assert.equal(run('validateProject(project).version'),5);
  assert.throws(()=>run('validateProject({...project,settings:{...project.settings,mat:-1}})'),/mat/);
  assert.throws(()=>run("validateProject({...project,trayGroups:[{...project.trayGroups[0],productId:'missing'}]})"),/missing product/);
  assert.throws(()=>run("validateProject({...project,products:[{id:'p',image:'https://example.com/image.png'}]})"),/image/);
});

test('history restores complete project state, groups input edits, and drops redo after a new edit',()=>{
  const source=fs.readFileSync('studio.js','utf8');
  const context=vm.createContext({console});
  vm.runInContext(`
    const studio={past:[],future:[],snapshot:null,restoring:false},editor={drag:null};
    const document={activeElement:null};let data={width:300,products:[],fabrication:{kerf:0},view:{xray:false}};
    function configuration(){return data;}
    function restore(next){data=next;}
    function historyButtons(){} function saveSoon(){} function toast(){}
  `,context);
  vm.runInContext(source.slice(source.indexOf('function checkpoint(){'),source.indexOf('remember=function')),context);
  vm.runInContext(source.slice(source.indexOf('function navigateHistory('),source.indexOf('undoEdit=function')),context);
  const run=s=>vm.runInContext(s,context);
  run("studio.snapshot=JSON.stringify(data);document.activeElement={tagName:'INPUT',type:'number'};data.width=310;checkpoint();data.width=320;checkpoint();");
  assert.equal(run('studio.past.length'),1);
  run("navigateHistory('undo')");assert.equal(run('data.width'),300);
  run("navigateHistory('redo')");assert.equal(run('data.width'),320);
  run("document.activeElement=null;data.products=[{name:'Sticker',image:'data:image/png;base64,abc'}];data.fabrication.kerf=.2;data.view.xray=true;checkpoint();navigateHistory('undo');");
  assert.equal(run('data.products.length'),0);assert.equal(run('data.fabrication.kerf'),0);
  run("navigateHistory('redo');");assert.equal(run('data.products[0].image'),'data:image/png;base64,abc');assert.equal(run('data.view.xray'),true);
  run("navigateHistory('undo');data.width=340;checkpoint();");assert.equal(run('studio.future.length'),0);
  const before=run('studio.past.length');run('checkpoint()');assert.equal(run('studio.past.length'),before);
  run('editor.drag={};data.width=350;checkpoint();data.width=360;checkpoint();');assert.equal(run('studio.past.length'),before);
  run('editor.drag=null;checkpoint();');assert.equal(run('studio.past.length'),before+1);
});

test('product files round-trip images and dimensions without overwriting existing products',()=>{
  const {context,run}=fixture(),source=fs.readFileSync('studio.js','utf8');
  vm.runInContext(source.slice(source.indexOf('const settingRanges='),source.indexOf("$('#importProject').onclick")),context);
  vm.runInContext(source.slice(source.indexOf('function productBundle('),source.indexOf('function exportProducts(')),context);
  run(`globalThis.item={id:'original',name:'Sticker sheet',width:65,height:100,depth:1,gap:2,quantity:8,image:'data:image/png;base64,YWJj'};globalThis.bundle=JSON.parse(JSON.stringify(productBundle([item])));globalThis.copies=importedProducts(bundle,[item],()=> 'fresh-id');`);
  assert.equal(run('copies[0].id'),'fresh-id');assert.equal(run('copies[0].name'),'Sticker sheet (2)');
  for(const key of ['width','height','depth','gap','quantity','image'])assert.equal(run(`copies[0].${key}`),run(`item.${key}`));
  assert.equal(run('item.id'),'original');assert.equal(run('item.name'),'Sticker sheet');
  assert.throws(()=>run("importedProducts({...bundle,units:'in'},[])"),/product JSON/);
  assert.throws(()=>run('importedProducts({...bundle,products:[]},[])'),/no products/);
  assert.throws(()=>run('importedProducts(bundle,Array(50).fill(item))'),/exceed 50/);
  assert.throws(()=>run('importedProducts({...bundle,products:[{...item,width:-2}]},[])'),/width/);
  assert.throws(()=>run("importedProducts({...bundle,products:[{...item,image:'https://example.com/photo.png'}]},[])"),/image/);
});

test('mixed products occupy separate slots with spacing and stay inside tray bounds',()=>{
  const {run}=fixture();
  run(`globalThis.G=solve();G.model=buildModel(G);globalThis.products=[{id:'a',name:'Sheet',width:65,height:90,depth:1,gap:2,quantity:2},{id:'b',name:'Box',width:45,height:50,depth:20,gap:3,quantity:1}];globalThis.placed=[];`);
  run(`for(const p of products){const pos=ProductPlacement.firstSpace(G,G.trays[0],p,placed,products);placed.push({id:p.id,productId:p.id,...pos});}`);
  assert.equal(run('placed.length'),2);
  assert.equal(run("ProductPlacement.valid(G,G.trays[0],products[1],placed[1],placed,products,'b')"),'');
  assert.match(run("ProductPlacement.valid(G,G.trays[0],products[1],placed[0],placed,products,'b')"),/Outside|Overlaps/);
  assert.match(run('ProductPlacement.valid(G,G.trays[0],products[0],{x:999,z:10},[],products)'),/Outside/);
  assert.equal(run("ProductPlacement.candidate(G,G.trays[0],products[0],{x:999,z:10},[],products).reason"),'');
});

test('manual placement survives project validation and tray copies do not share positions',()=>{
  const {run,context}=fixture(),source=fs.readFileSync('studio.js','utf8');
  vm.runInContext(source.slice(source.indexOf('const settingRanges='),source.indexOf("$('#importProject').onclick")),context);
  run(`globalThis.product={id:'a',name:'Sheet',width:65,height:90,depth:1,gap:2,quantity:2,image:''};globalThis.tray=makeTray({placements:[{id:'one',productId:'a',x:12,z:9}]});globalThis.copy=makeTray(tray);copy.placements[0].x=33;`);
  assert.equal(run('tray.placements[0].x'),12);
  run(`globalThis.project={schema:'display-stand-config',version:5,units:'mm',settings:{mat:3,frontHeightDefault:30,extDefault:20,partLength:300,frontGrip:20,toeExtra:10,sideRadius:6,rearExtra:10},products:[product],trayGroups:[tray]};`);
  assert.equal(run('validateProject(project).trayGroups[0].placements[0].z'),9);
  assert.throws(()=>run("validateProject({...project,trayGroups:[{...tray,placements:[{id:'one',productId:'missing',x:1,z:1}]}]})"),/placed product/);
  assert.throws(()=>run("validateProject({...project,trayGroups:[{...tray,placements:[{id:'one',productId:'a',x:NaN,z:1}]}]})"),/position/);
});

test('isolating two repeated trays preserves physical tray identities and independent layouts',()=>{
  const {run,context}=fixture(),source=fs.readFileSync('product-arranger.js','utf8');
  vm.runInContext(source.slice(source.indexOf('function isolatePlacementTray('),source.indexOf('function canMaterialize(')),context);
  run("S.trays=[makeTray({count:5,placements:[{id:'item',productId:'a',x:0,z:2}]})];isolatePlacementTray(1).placements=[];isolatePlacementTray(4).placements.push({id:'moved',productId:'b',x:10,z:5});");
  assert.equal(run('expandedTrays().length'),5);
  assert.equal(run('expandedTrays()[0].placements.length'),1);
  assert.equal(run('expandedTrays()[1].placements.length'),0);
  assert.equal(run('expandedTrays()[2].placements.length'),1);
  assert.equal(run('expandedTrays()[4].placements.length'),2);
});

test('held-product motion stays bounded, settles, and respects reduced motion',()=>{
  const source=fs.readFileSync('product-arranger.js','utf8'),context=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function heldMotionStep('),source.indexOf('function startHeldProduct(')),context);
  const run=s=>vm.runInContext(s,context);
  run("globalThis.motion={angle:0,velocity:0};for(let i=0;i<30;i++)heldMotionStep(motion,40,.016,false);");
  assert.ok(run('motion.angle<0 && Math.abs(motion.angle)<=.65'));
  run("for(let i=0;i<300;i++)heldMotionStep(motion,0,.016,false);");
  assert.ok(run('Math.abs(motion.angle)<.001'));
  run("motion.angle=.4;motion.velocity=5;heldMotionStep(motion,50,.016,true);");
  assert.equal(run('motion.angle'),0);assert.equal(run('motion.velocity'),0);
});

test('held-product resting pose matches the placed product centre at different tray angles',()=>{
  const source=fs.readFileSync('product-arranger.js','utf8'),context=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function heldPose('),source.indexOf('function startHeldProduct(')),context);
  for(const angle of [-.6,0,.4]){
    const result=vm.runInContext(`(()=>{const a=${angle},G={thick:3,trays:[{a,floorRear:{x:35,y:70}}]},product={height:90},target={tray:0,x:42,z:20},pose=heldPose(G,target,product),offset=-8-product.height/2;return {x:pose.x,y:pose.y+Math.cos(pose.angle)*offset,z:pose.z+Math.sin(pose.angle)*offset};})()`,context);
    assert.equal(result.x,42);
    assert.ok(Math.abs(result.y-(70+Math.sin(angle)*20+Math.cos(angle)*46.5))<1e-8);
    assert.ok(Math.abs(result.z-(35+Math.cos(angle)*20-Math.sin(angle)*46.5))<1e-8);
  }
});
test('drag snapping matches adjacent spacing and One more slots, with a free-placement bypass',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('product-placement.js','utf8'),context);
  const result=vm.runInContext(`(()=>{
    const G={model:{sideX:101},thick:2},s={t:{depth:100}},p={id:'p',width:20,depth:10,gap:2},q={id:'q',width:30,depth:20,gap:4},products=[p,q],others=[{id:'a',productId:'q',x:0,z:40}];
    const snap=(point,step=1)=>ProductPlacement.candidate(G,s,p,point,others,products,null,step);
    const next=ProductPlacement.firstSpace(G,s,p,others,products);
    return {right:snap({x:27,z:41}),left:snap({x:-27,z:39}),front:snap({x:1,z:57}),free:snap({x:31.2,z:41.3},0),slot:snap({x:next.x+2,z:next.z+2}),next,ignored:ProductPlacement.candidate(G,s,p,{x:1,z:40},others,products,'a',1)};
  })()`,context);
  assert.equal(result.right.x,29);assert.equal(result.right.z,40);assert.equal(result.right.reason,'');
  assert.equal(result.left.x,-29);assert.equal(result.front.z,59);
  assert.equal(result.free.x,31.2);assert.equal(result.free.z,41.3);
  assert.equal(result.slot.x,result.next.x);assert.equal(result.slot.z,result.next.z);
  assert.equal(result.ignored.x,1);assert.equal(result.ignored.reason,'');
});

test('thin sticker sheets snap alongside before choosing a nearby front row',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('product-placement.js','utf8'),context);
  const run=s=>vm.runInContext(s,context);
  run("const G={model:{sideX:151},thick:2},s={t:{depth:70}},p={id:'sheet',width:90,depth:1,gap:2},items=[{id:'one',productId:'sheet',x:-60,z:10}];");
  for(const x of [29,32,35]){
    const result=run(`ProductPlacement.candidate(G,s,p,{x:${x},z:13},items,[p],null,5)`);
    assert.equal(result.x,32);assert.equal(result.z,10);assert.equal(result.reason,'');
  }
  const front=run('ProductPlacement.candidate(G,s,p,{x:-60,z:13},items,[p],null,5)');
  assert.equal(front.x,-60);assert.equal(front.z,13);assert.equal(front.reason,'');
  const free=run('ProductPlacement.candidate(G,s,p,{x:35,z:13},items,[p],null,0)');
  assert.equal(free.x,35);assert.equal(free.z,13);
});

test('orbit pivot sits at the selected tray floor centre, including tilted trays',()=>{
 const source=fs.readFileSync('index.html','utf8'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function trayOrbitPoint('),source.indexOf('function updateCamera(){',source.indexOf('function trayOrbitPoint('))),context);
 for(const a of [0,.4,-.3]){
  const point=vm.runInContext(`trayOrbitPoint({thick:4,trays:[{a:0,t:{depth:20},floorRear:{x:0,y:0}},{a:${a},t:{depth:80},floorRear:{x:30,y:100}}]},1)`,context);
  assert.equal(point.x,0);assert.ok(Math.abs(point.y-(100+Math.sin(a)*40+Math.cos(a)*2))<1e-9);assert.ok(Math.abs(point.z-(30+Math.cos(a)*40-Math.sin(a)*2))<1e-9);
 }
});
