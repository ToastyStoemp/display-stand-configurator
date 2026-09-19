/* Tray-local product coordinates: x across the stand, z from the rear edge. */
(function(scope){
  'use strict';
  function pack(G,s,p){
    const width=Math.max(0,2*G.model.sideX-G.thick-2),depth=Math.max(0,s.t.depth-2);
    const columns=Math.max(0,Math.floor((width+p.gap)/(p.width+p.gap))),rows=Math.max(0,Math.floor((depth+p.gap)/(p.depth+p.gap))),capacity=columns*rows;
    return {width,depth,columns,rows,capacity,count:p.quantity?Math.min(p.quantity,capacity):capacity};
  }
  function items(G,s,products){
    if(Array.isArray(s.t.placements))return s.t.placements.map(item=>({...item}));
    const p=products.find(p=>p.id===s.t.productId);if(!p)return [];
    const fit=pack(G,s,p),span=fit.columns*p.width+Math.max(0,fit.columns-1)*p.gap;
    return Array.from({length:Math.min(500,fit.count)},(_,i)=>({id:'auto-'+i,productId:p.id,x:-span/2+p.width/2+(i%fit.columns)*(p.width+p.gap),z:1+p.depth/2+Math.floor(i/fit.columns)*(p.depth+p.gap)}));
  }
  function limits(G,s,p){const half=Math.max(0,G.model.sideX-G.thick/2-1);return {minX:-half+p.width/2,maxX:half-p.width/2,minZ:1+p.depth/2,maxZ:s.t.depth-1-p.depth/2};}
  function valid(G,s,p,position,others,products,ignoreId=null){
    const b=limits(G,s,p),eps=1e-5;
    if(position.x<b.minX-eps||position.x>b.maxX+eps||position.z<b.minZ-eps||position.z>b.maxZ+eps)return 'Outside the usable tray area';
    for(const item of others){
      if(item.id===ignoreId)continue;const q=products.find(q=>q.id===item.productId);if(!q)continue;
      const gap=Math.max(p.gap,q.gap);
      if(Math.abs(position.x-item.x)<(p.width+q.width)/2+gap-eps&&Math.abs(position.z-item.z)<(p.depth+q.depth)/2+gap-eps)return 'Overlaps another product or its spacing';
    }
    return '';
  }
  function candidate(G,s,p,point,others,products,ignoreId=null,step=1){
    const b=limits(G,s,p),snap=v=>step?Math.round(v/step)*step:v;
    const position={x:Math.max(b.minX,Math.min(b.maxX,snap(point.x))),z:Math.max(b.minZ,Math.min(b.maxZ,snap(point.z)))};
    if(step){
      const nearby=others.filter(item=>item.id!==ignoreId),radius=Math.max(4,Math.min(8,step)),xs=[b.minX,b.maxX],zs=[b.minZ,b.maxZ],alongside=[];
      for(const item of nearby){
        const q=products.find(q=>q.id===item.productId);if(!q)continue;
        const gap=Math.max(p.gap,q.gap);
        // Thin products have front/back slots only a few mm apart. When the
        // pointer is beside an item, prefer its row over those closer slots.
        for(const x of [item.x-(p.width+q.width)/2-gap,item.x+(p.width+q.width)/2+gap]){
          for(const z of [item.z,item.z+(q.depth-p.depth)/2,item.z-(q.depth-p.depth)/2]){
            if(Math.abs(x-point.x)<=radius&&Math.abs(z-point.z)<=radius&&!valid(G,s,p,{x,z},others,products,ignoreId))alongside.push({x,z,distance:Math.hypot(x-point.x,z-point.z)});
          }
        }
        xs.push(item.x-(p.width+q.width)/2-gap,item.x+(p.width+q.width)/2+gap,item.x,item.x+(q.width-p.width)/2,item.x-(q.width-p.width)/2);
        zs.push(item.z-(p.depth+q.depth)/2-gap,item.z+(p.depth+q.depth)/2+gap,item.z,item.z+(q.depth-p.depth)/2,item.z-(q.depth-p.depth)/2);
      }
      // These edge and neighbour coordinates also form the slots searched by firstSpace.
      const close=(values,value)=>[...new Set(values)].filter(v=>Math.abs(v-value)<=radius).sort((a,b)=>Math.abs(a-value)-Math.abs(b-value)).slice(0,8);
      const candidates=[];
      for(const x of [...close(xs,point.x),position.x])for(const z of [...close(zs,point.z),position.z]){
        if(!valid(G,s,p,{x,z},others,products,ignoreId))candidates.push({x,z,axes:Number(xs.includes(x))+Number(zs.includes(z)),distance:Math.hypot(x-point.x,z-point.z)});
      }
      candidates.sort((a,b)=>b.axes-a.axes||a.distance-b.distance);
      alongside.sort((a,b)=>a.distance-b.distance);
      const best=alongside[0]||candidates[0];
      if(best){position.x=best.x;position.z=best.z;}
    }
    return {...position,reason:valid(G,s,p,position,others,products,ignoreId)};
  }
  function firstSpace(G,s,p,others,products){
    const b=limits(G,s,p),xs=[b.minX],zs=[b.minZ];
    others.forEach(item=>{const q=products.find(q=>q.id===item.productId);if(q){const gap=Math.max(p.gap,q.gap);xs.push(item.x+(q.width+p.width)/2+gap);zs.push(item.z+(q.depth+p.depth)/2+gap);}});
    const sorted=a=>[...new Set(a)].sort((a,b)=>a-b);
    for(const z of sorted(zs))for(const x of sorted(xs))if(!valid(G,s,p,{x,z},others,products))return {x,z};
    return null;
  }
  scope.ProductPlacement={pack,items,limits,valid,candidate,firstSpace};
})(globalThis);
