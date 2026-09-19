/* Fabrication geometry uses millimetres. No display transforms enter these paths. */
(function (scope) {
  'use strict';
  const snap = value => Array.isArray(value)?value.map(snap):Math.round(value*1e6)/1e6;
  const clean = ring => ring.filter((p,i) => !i || Math.hypot(p[0]-ring[i-1][0],p[1]-ring[i-1][1])>1e-8).filter((p,i,a)=>i!==a.length-1 || Math.hypot(p[0]-a[0][0],p[1]-a[0][1])>1e-8);
  const area = ring => clean(ring).reduce((sum,p,i,a)=>{const q=a[(i+1)%a.length];return sum+(p[0]*q[1]-q[0]*p[1])/2;},0);
  function circle(p,r) { const pts=Array.from({length:32},(_,i)=>[p[0]+r*Math.cos(i*Math.PI/16),p[1]+r*Math.sin(i*Math.PI/16)]);return [pts.concat([pts[0]])]; }
  function relief(mp,diameter) {
    if(!diameter)return mp;
    const cuts=[];
    mp.forEach(poly=>poly.forEach((ring,ri)=>{
      let points=clean(ring);if((area(points)>0)!==(ri===0))points.reverse();
      points.forEach((p,i)=>{
        const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
        const cross=(p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]);
        const lengths=Math.hypot(p[0]-a[0],p[1]-a[1])*Math.hypot(b[0]-p[0],b[1]-p[1]);
        if(cross < -lengths*.05)cuts.push(circle(p,diameter/2));
      });
    }));
    return cuts.length?polygonClipping.difference(snap(mp),...cuts.map(snap)):mp;
  }
  // Integer Clipper offsets avoid floating-point failures at tangent relief arcs.
  // Exterior rings expand and holes contract by half the cutter kerf.
  function compensate(mp,kerf) {
    if(!kerf)return mp;
    const scale=100000,offset=new ClipperLib.ClipperOffset(2,.002*scale);
    const paths=mp.flatMap(poly=>poly.map((ring,i)=>{
      const path=clean(ring).map(p=>({X:Math.round(p[0]*scale),Y:Math.round(p[1]*scale)}));
      if(ClipperLib.Clipper.Orientation(path)!==(i===0))path.reverse();return path;
    }));
    offset.AddPaths(paths,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
    const tree=new ClipperLib.PolyTree();offset.Execute(tree,kerf/2*scale);
    const result=[],ring=node=>{const points=node.Contour().map(p=>[p.X/scale,p.Y/scale]);return points.concat([points[0]]);};
    function visit(node){
      for(const child of node.Childs()){
        if(!child.IsHole())result.push([ring(child),...child.Childs().filter(n=>n.IsHole()).map(ring)]);
        visit(child);
      }
    }
    visit(tree);
    if(result.length!==mp.length||result.reduce((n,p)=>n+p.length,0)!==mp.reduce((n,p)=>n+p.length,0))throw Error('Kerf closes a hole or merges separate regions. Reduce kerf or revise the part.');
    return result;
  }
  function bounds(mp) { const pts=mp.flat(2);return {minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))}; }
  function layout(parts,kerf) {
    let x=10,y=10,row=0;
    const items=parts.map(part=>{
      const contours=compensate(part.contours,kerf),b=bounds(contours),w=b.maxX-b.minX,h=b.maxY-b.minY;
      if(!Number.isFinite(w+h)||w<=0||h<=0)throw Error('A part has no valid cutting contour.');
      if(x>10&&x+w>1000){x=10;y+=row+18;row=0;}
      const item={...part,contours:contours.map(poly=>poly.map(ring=>ring.map(p=>[p[0]-b.minX+x,b.maxY-p[1]+y]))),labelX:x,labelY:y+h+5};
      x+=w+12;row=Math.max(row,h);return item;
    });
    return {items,width:Math.max(...items.map(p=>bounds(p.contours).maxX))+10,height:y+row+18};
  }
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const num = n => Number(n.toFixed(5));
  function svg(sheet,metadata) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(sheet.width)}mm" height="${num(sheet.height)}mm" viewBox="0 0 ${num(sheet.width)} ${num(sheet.height)}"><desc>${escape(metadata)}</desc><g id="CUT" fill="none" stroke="#000" stroke-width="0.01">${sheet.items.map(p=>`<path data-part="${escape(p.name)}" d="${p.contours.flatMap(poly=>poly.map(r=>clean(r).map((v,i)=>`${i?'L':'M'}${num(v[0])},${num(v[1])}`).join(' ')+'Z')).join(' ')}"/>`).join('')}</g></svg>`;
  }
  function dxf(sheet) {
    const out=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
    sheet.items.forEach(p=>p.contours.forEach(poly=>poly.forEach(ring=>{
      const pts=clean(ring);out.push('0','LWPOLYLINE','100','AcDbEntity','8','CUT','100','AcDbPolyline','90',String(pts.length),'70','1');
      pts.forEach(v=>out.push('10',String(num(v[0])),'20',String(num(sheet.height-v[1]))));
    })));
    out.push('0','ENDSEC','0','EOF');return out.join('\r\n')+'\r\n';
  }
  scope.Fabrication={clean,area,relief,compensate,bounds,layout,svg,dxf};
})(globalThis);
