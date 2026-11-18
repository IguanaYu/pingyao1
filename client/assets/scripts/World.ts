import { Node, MeshRenderer, Material, Color, Vec3, primitives, utils, Mesh, Camera, Prefab, instantiate } from 'cc';

export const V = (p: number[]) => new Vec3(p[0],p[1],p[2]);
const materials=new Map<string,Material>(); const meshes=new Map<string,Mesh>();
export function material(hex:string,alpha=1):Material {const key=hex+alpha;let m=materials.get(key);if(m)return m;m=new Material();m.initialize({effectName:'builtin-standard',technique:alpha<1?1:0});const c=Color.fromHEX(new Color(),hex);c.a=alpha*255;m.setProperty('albedo',c);m.setProperty('roughness',.85);materials.set(key,m);return m;}
export function shape(parent:Node,name:string,kind:string,color:string,pos:Vec3,scale:Vec3,alpha=1):Node {
  const n=new Node(name);parent.addChild(n);n.setPosition(pos);n.setScale(scale);let mesh=meshes.get(kind);if(!mesh){const g=kind==='sphere'?primitives.sphere(.5,{segments:10}):kind==='cylinder'?primitives.cylinder(.5,.5,1,{radialSegments:12}):primitives.box();mesh=utils.createMesh(g);meshes.set(kind,mesh);}const r=n.addComponent(MeshRenderer);r.mesh=mesh;r.setMaterial(material(color,alpha),0);return n;
}
export class DemoWorld {
  root:Node; private destination:Node; markers=new Map<string,Node>(); objects=new Map<string,Node>();
  constructor(parent:Node,public data:any,temple:Prefab) {this.root=new Node('TempleWorld');parent.addChild(this.root);this.root.addChild(instantiate(temple));
    this.destination=shape(this.root,'WalkDestination','cylinder','#e4c06b',new Vec3(),new Vec3(.56,.018,.56),.75);
    this.destination.active=false;
    for(const step of data.connectionSteps||[])shape(this.root,step.id,'box',step.color,V(step.position),V(step.size));
    for(const s of data.stations){if(s.kind==='incense')continue;const marker=shape(this.root,'Marker_'+s.id,'cylinder','#c5ac70',V(s.position).add(new Vec3(0,.014,0)),new Vec3(.9,.018,.9),.5);this.markers.set(s.id,marker);if(s.kind==='sit'){shape(this.root,'蒲团_'+s.id,'cylinder','#b4aa79',V(s.position).add(new Vec3(0,.06,0)),new Vec3(.72,.12,.72));}}
  }
  showDestination(point:Vec3|null) { this.destination.active=!!point; if(point)this.destination.setPosition(point); }
  syncObjects(room:any) {
    const wanted=new Set<string>();
    room.state.offerings?.forEach((obj:any,id:string)=>{
      wanted.add(id);
      if(this.objects.has(id))return;
      const n=new Node(id);this.root.addChild(n);n.setPosition(obj.x,obj.y,obj.z);
      n.setRotationFromEuler(0,(obj.yaw||0)*180/Math.PI);
      this.offering(n,obj.offeringType);this.objects.set(id,n);
    });
    this.objects.forEach((n,id)=>{if(!wanted.has(id)){n.destroy();this.objects.delete(id);}});
  }
  incense(parent:Node) {for(let i=-1;i<=1;i++){shape(parent,'香','cylinder','#927142',new Vec3(i*.025,.14,0),new Vec3(.012,.28,.012));shape(parent,'香头','sphere','#e7a367',new Vec3(i*.025,.285,0),new Vec3(.019,.014,.019));}for(let i=0;i<4;i++)shape(parent,'Smoke'+i,'sphere','#e5e8dd',new Vec3(0,.35+i*.12,0),new Vec3(.065,.12,.065),.16);}
  offering(parent:Node,type:string) {if(type==='flower'){shape(parent,'花瓶','cylinder','#dad6bd',new Vec3(0,.14,0),new Vec3(.15,.28,.15));for(let i=0;i<5;i++){const a=i*2.4;const x=Math.sin(a)*.11,z=Math.cos(a)*.09;const stem=shape(parent,'花枝','cylinder','#6a8456',new Vec3(x*.5,.34,z*.5),new Vec3(.013,.32,.013));stem.setRotationFromEuler(Math.sin(a)*12,0,Math.cos(a)*12);for(let p=0;p<5;p++){const b=p*Math.PI*.4;shape(parent,'花瓣','sphere',i%2?'#e5c8a6':'#e6dfc8',new Vec3(x+Math.sin(b)*.045,.5+Math.cos(b)*.015,z+Math.cos(b)*.045),new Vec3(.09,.045,.09));}shape(parent,'花心','sphere','#c49b57',new Vec3(x,.52,z),new Vec3(.04,.025,.04));}}else{shape(parent,'果盘','cylinder','#d9c59c',new Vec3(0,.025,0),new Vec3(.47,.05,.37));for(let i=0;i<5;i++){const a=i*2.4;shape(parent,'时果','sphere',i%2?'#c58a48':'#a9734f',new Vec3(Math.sin(a)*.13,.105,Math.cos(a)*.09),new Vec3(.14,.15,.14));}}}
  project(camera:Camera,p:Vec3):{x:number,y:number,visible:boolean}{const s=new Vec3();camera.worldToScreen(p,s);const canvas=document.querySelector('canvas')!;const rect=canvas.getBoundingClientRect();const direction=new Vec3();Vec3.subtract(direction,p,camera.node.worldPosition);const forward=camera.node.forward;return{x:rect.left+s.x/canvas.width*rect.width,y:rect.bottom-s.y/canvas.height*rect.height,visible:Vec3.dot(direction,forward)>0&&s.x>0&&s.x<canvas.width&&s.y>0&&s.y<canvas.height};}
}
