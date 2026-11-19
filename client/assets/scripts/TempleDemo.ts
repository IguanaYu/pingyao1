import {_decorator,Component,Node,Camera,DirectionalLight,Color,Vec3,resources,JsonAsset,Prefab,director,MeshRenderer} from 'cc';
import {DemoInterface} from './Interface';
import {DemoWorld,V,material,shape} from './World';
import {Navigation,floorHeight,type GroundPoint} from './Navigation';
import {VisitorView} from './Visitors';
const {ccclass}=_decorator;
const SPEED=3.1;
interface Station { id:string; kind:string; name:string; position:[number,number,number]; }
interface Ritual { kind:string; station:Station; offeringType?:string; tried?:Set<string>; }
const stationPoint=(s:Station):GroundPoint=>({x:s.position[0],z:s.position[2]});
const heading:Record<string,string>={bow:'前往正殿…',offering:'前往供案…',sit:'前往蒲团…'};
function angle(a:number,b:number,t:number){let d=(b-a+Math.PI*3)%(Math.PI*2)-Math.PI;return a+d*t;}

@ccclass('TempleDemo')
export class TempleDemo extends Component {
  ui!:DemoInterface; data:any; world!:DemoWorld; visitorPrefab!:Prefab; camera!:Camera; room:any=null;
  visitors=new Map<string,VisitorView>(); localPosition=new Vec3();localYaw=Math.PI;cameraYaw=0;cameraDistance=5.2;overview=false;
  private ready=false;private initialized=false;private sendTime=0;private moving=false;private lastMoving=false;private lastAction='idle';private clockOffset=0;private lastServerTime=0;private countTime=0;private joining=false;
  private navigation!:Navigation;
  private path:GroundPoint[]=[];
  private ritual:Ritual|null=null;
  private pendingStart:{kind:string; ritual:Ritual|null; until:number}|null=null;
  async start(){
    this.ui=new DemoInterface();this.ui.onJoin=name=>this.connect(name);this.ui.onAction=(k,t)=>this.act(k,t);this.ui.onCancel=()=>this.cancel();this.ui.onGround=(x,y)=>this.walkToClick(x,y);this.ui.onOverview=()=>{this.overview=!this.overview;this.ui.overview(this.overview);};
    try{
      const scene=director.getScene()!;const globals:any=scene.globals;globals.ambient.skyLightingColor=new Color(170,187,177);globals.ambient.skyIllum=28000;globals.ambient.groundAlbedo=new Color(118,126,111);globals.skybox.enabled=false;
      const sun=new Node('WarmSun');scene.addChild(sun);sun.setRotationFromEuler(-51,-32,0);const light=sun.addComponent(DirectionalLight);light.color=new Color(255,241,215);light.illuminance=48000;
      const cn=new Node('VisitorCamera');scene.addChild(cn);this.camera=cn.addComponent(Camera);this.camera.fov=58;this.camera.near=.05;this.camera.far=180;this.camera.clearColor=new Color(168,184,175);
      this.ui.loading('正在整理院落与角色…');
      this.data=await new Promise<any>((resolve,reject)=>resources.load('scene',JsonAsset,(e,a)=>e?reject(e):resolve(a.json)));
      this.navigation=new Navigation(this.data);
      const prefabs=await new Promise<Prefab[]>((resolve,reject)=>resources.loadDir('models',Prefab,(e,a)=>e?reject(e):resolve(a)));
      const temple=prefabs.find(p=>/temple/i.test(p.name));this.visitorPrefab=prefabs.find(p=>/visitor/i.test(p.name))!;
      if(!temple||!this.visitorPrefab)throw new Error('模型未加载：'+prefabs.map(p=>p.name).join(','));
      this.world=new DemoWorld(scene,this.data,temple);this.localPosition=V(this.data.spawn);this.localYaw=this.data.spawnYaw;this.updateCamera(1);this.cuteStatues();this.ready=true;this.ui.setReady();
      (window as any).templeDemo=this;
    }catch(e:any){console.error(e);this.ui.loading('庙院加载失败，请刷新后重试。'+(e.message||''));}
  }
  /** 神像萌化：隐藏旧脸/须发（按材质），换上与玩家一致的圆润头部。袍服、金冠等原样保留。 */
  private static readonly HIDE_MATS=/^(st_(skin|pupil|lip|hair|white_hair)|aux_(skin|darkskin|redface|teeth|mouth|pale))/;
  private static readonly CUTE_HEADS:[number,number,number,number,number,string,string][]=[
    [0,2.93,-23.005,.235,0,'#7a4120','#080b09'],
    [-2.5,2.705,-22.96,.227,0,'#855a33','#85866c'],
    [2.5,2.705,-22.96,.227,0,'#6b3a22','#080b09'],
    [-4.65,2.75,-22.98,.235,0,'#7d3a24','#080b09'],
    [4.65,2.75,-22.98,.235,0,'#5c7a5a','#080b09'],
    ...[10,7.5,5,2.4,0,-2.4,-4.8].map<any>(z=>[-19.04,2.33,z,.202,90,'#7c542c','#080b09']),
    ...[[8.3,'#7d3a24'],[5.8,'#7c542c'],[3.3,'#7c542c'],[0.8,'#5a3f28'],[-1.7,'#7d3a24']].map<any>(([z,skin])=>[19.04,2.246,z,.213,-90,skin,'#080b09']),
    [18.94,2.309,12,.222,-90,'#5a3f28','#080b09'],
    [18.94,2.309,-5.4,.222,-90,'#a3834f','#080b09'],
  ];
  private cuteStatues(){
    const ghost=material('#000000',0);
    const visit=(n:Node)=>{n.children.forEach(visit);const r=n.getComponent(MeshRenderer);if(!r)return;
      const mats=r.sharedMaterials;for(let i=0;i<mats.length;i++){const m=mats[i];if(m&&TempleDemo.HIDE_MATS.test(m.name))r.setMaterial(ghost,i);}};
    visit(this.world.root);
    const root=this.world.root;
    TempleDemo.CUTE_HEADS.forEach(([x,y,z,r,yaw,skin,hair],i)=>{
      const holder=new Node('CuteStatue'+i);root.addChild(holder);holder.setPosition(x,y,z);holder.setRotationFromEuler(0,yaw,0);
      shape(holder,'head','sphere',skin,new Vec3(0,0,0),new Vec3(r*2.05,r*1.95,r*2.05));
      shape(holder,'hair','sphere',hair,new Vec3(0,r*.34,-r*.06),new Vec3(r*2.1,r*1.28,r*2.1));
      shape(holder,'topknot','sphere',hair,new Vec3(0,r*.88,-r*.12),new Vec3(r*.72,r*.6,r*.66));
      shape(holder,'eyeL','sphere','#030505',new Vec3(-r*.30,r*.06,r*.95),new Vec3(r*.13,r*.17,r*.1));
      shape(holder,'eyeR','sphere','#030505',new Vec3(r*.30,r*.06,r*.95),new Vec3(r*.13,r*.17,r*.1));
      shape(holder,'earL','sphere',skin,new Vec3(-r*.99,-r*.02,-r*.08),new Vec3(r*.24,r*.38,r*.28));
      shape(holder,'earR','sphere',skin,new Vec3(r*.99,-r*.02,-r*.08),new Vec3(r*.24,r*.38,r*.28));
    });
  }
  async connect(nickname:string){if(!this.ready||this.joining)return;this.joining=true;this.ui.connecting();
    try{if(this.room){const old=this.room;this.room=null;await old.leave();}this.visitors.forEach((v,id)=>{v.destroy();this.ui.removeLabel(id);});this.visitors.clear();this.resetWalk();this.initialized=false;
      let configured='auto';try{const c=await fetch(new URL('runtime-config.json',document.baseURI).href,{cache:'no-cache'});if(c.ok)configured=(await c.json()).serverUrl||'auto';}catch{}
      const explicit=new URLSearchParams(location.search).get('server');let endpoint=explicit||configured;
      if(endpoint==='auto')endpoint=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`;
      const SDK=(window as any).Colyseus;if(!SDK)throw new Error('多人连接组件未载入');const client=new SDK.Client(endpoint);const room=await client.joinOrCreate('temple',{nickname});room.reconnection.enabled=false;this.room=room;
      room.onMessage('notice',(m:any)=>this.ui.toast(m.text||String(m)));
      room.onMessage('correction',(m:any)=>{
        this.localPosition.set(m.x,m.y,m.z);this.localYaw=m.yaw;
        const target=this.path[this.path.length-1];
        if(target){
          const route=this.navigation.path(this.localPosition,target);
          if(route)this.path=route;
          else {this.stopWalk();this.ui.toast('这条路暂时走不通，请重新选择。');}
        }
      });
      room.onMessage('actionRejected',(m:any)=>{
        const pending=this.pendingStart;
        this.pendingStart=null;
        if(m.reason==='occupied'&&pending?.ritual?.kind==='sit'){
          this.chooseStation('sit',undefined,pending.ritual.tried);
        }else this.ui.toast(m.text);
      });
      room.onMessage('event',(m:any)=>{if(m.type==='actionCompleted'){this.ui.chime();this.ui.toast(m.kind==='incense'?'敬香完成':m.kind==='offering'?'供物已安放':'礼敬完成');}});
      room.onLeave(()=>{if(this.room===room){this.room=null;this.resetWalk();this.ui.disconnected('连接已断开，点击“重新进入”返回院子');}});
      room.onError((_code:any,message:any)=>this.ui.toast(message||'连接暂时中断'));
      this.ui.joined();this.ui.toast('入院有礼，自在游览');
    }catch(e:any){console.error(e);this.ui.disconnected('暂时无法进入院子，请确认游戏服务已启动后重试');}finally{this.joining=false;}
  }
  private resetWalk(){
    this.stopWalk();this.pendingStart=null;this.lastMoving=false;this.lastAction='idle';this.sendTime=0;
  }
  private stopWalk(){
    this.path=[];this.ritual=null;this.moving=false;this.world.showDestination(null);
  }
  private ownPlayer(){ return this.room?.state?.players?.get(this.room.sessionId); }
  private walkToClick(clientX:number,clientY:number){
    const own=this.ownPlayer();
    if(!this.initialized||!own)return;
    if(this.pendingStart||own.action!=='idle'){
      this.ui.toast(own.action==='sit'?'请先点击「起身」。':'请先完成或取消当前仪式。');return;
    }
    this.ui.closeOffering();
    const canvas=document.querySelector('canvas')!,rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const ray=this.camera.screenPointToRay((clientX-rect.left)*canvas.width/rect.width,(rect.bottom-clientY)*canvas.height/rect.height);
    const point=this.navigation.pick(ray.o,ray.d);
    const route=point&&this.navigation.path(this.localPosition,point,true);
    if(!route){this.ui.toast('请点击可以行走的地面。');return;}
    this.setPath(route,null);
  }
  private setPath(path:GroundPoint[],ritual:Ritual|null){
    this.path=path;this.ritual=ritual;
    const p=path[path.length-1];
    this.world.showDestination(p?new Vec3(p.x,floorHeight(this.data,p.x,p.z)+.025,p.z):null);
  }
  cancel(){
    if(!this.room)return;
    if(this.path.length||this.ritual){this.flushStop();this.stopWalk();return;}
    if(this.pendingStart)this.pendingStart=null;
    this.room.send(this.ownPlayer()?.action==='sit'?'stand':'cancel',{});
  }
  act(kind:string,offeringType?:string){
    const own=this.ownPlayer();
    if(!this.initialized||!own){this.ui.toast('请先进入院子。');return;}
    if(this.pendingStart||own.action!=='idle'){
      if(own.action==='sit'&&kind==='sit')this.cancel();
      else this.ui.toast('请先完成或取消当前仪式。');
      return;
    }
    if(kind==='incense'){
      this.flushStop();this.stopWalk();this.requestAction('incense',null);return;
    }
    this.chooseStation(kind,offeringType);
  }
  private chooseStation(kind:string,offeringType?:string,tried=new Set<string>()){
    const occupied=new Set<string>();
    this.room?.state?.players?.forEach((p:any)=>{if(p.stationId)occupied.add(p.stationId);});
    const stations=(this.data.stations as Station[]).filter(s=>s.kind===kind);
    const available=stations.filter(s=>!occupied.has(s.id)&&!tried.has(s.id))
      .sort((a,b)=>Math.hypot(this.localPosition.x-a.position[0],this.localPosition.z-a.position[2])-Math.hypot(this.localPosition.x-b.position[0],this.localPosition.z-b.position[2]));
    for(const station of available){
      const path=this.navigation.path(this.localPosition,stationPoint(station));
      if(path){
        tried.add(station.id);this.setPath(path,{kind,station,offeringType,tried});return;
      }
    }
    this.ui.toast(available.length?'暂时找不到通往仪式位置的路。':kind==='sit'?'蒲团暂时坐满了，请稍等。':'这里有人正在使用，请稍等。');
  }
  private sendPosition(moving:boolean){
    const p=this.localPosition;
    this.room.send('move',{x:p.x,y:p.y,z:p.z,yaw:this.localYaw,moving});
    this.lastMoving=moving;this.sendTime=0;
  }
  private flushStop(){ if(this.moving||this.lastMoving)this.sendPosition(false); }
  private requestAction(kind:string,ritual:Ritual|null){
    this.pendingStart={kind,ritual,until:Date.now()+3000};
    this.room.send('act',{kind,stationId:ritual?.station.id,offeringType:ritual?.offeringType});
  }
  private advanceWalk(delta:number){
    if(this.pendingStart&&Date.now()>this.pendingStart.until){this.pendingStart=null;this.ui.toast('仪式未开始，可以再点一次。');}
    const wasMoving=this.moving;
    const hadPath=this.path.length>0;
    this.moving=false;
    this.sendTime+=delta;
    const p=this.localPosition;
    let budget=SPEED*delta, travelled=false;
    while(budget>1e-5&&this.path.length){
      const point=this.path[0],dx=point.x-p.x,dz=point.z-p.z,length=Math.hypot(dx,dz);
      const step=Math.min(budget,length);
      if(length>1e-5){
        const next={x:p.x+dx*(step/length),z:p.z+dz*(step/length)};
        if(!this.navigation.clear(p,next)){
          this.stopWalk();this.ui.toast('这条路暂时走不通，请重新选择。');break;
        }
        p.set(next.x,floorHeight(this.data,next.x,next.z),next.z);
        this.localYaw=angle(this.localYaw,Math.atan2(dx,dz),Math.min(1,delta*14));
        budget-=step;travelled=true;
      }
      if(length<=step+1e-5){
        this.path.shift();
        // Send the turn itself; the server checks a straight segment between packets.
        if(this.path.length&&travelled)this.sendPosition(true);
      }
    }
    this.moving=this.path.length>0;
    if(this.moving){
      if(this.sendTime>=.08)this.sendPosition(true);
    }else{
      if(travelled||wasMoving||this.lastMoving||this.ritual)this.sendPosition(false);
      const ritual=this.ritual;
      this.ritual=null;
      if(hadPath||wasMoving||ritual)this.world.showDestination(null);
      if(ritual)this.requestAction(ritual.kind,ritual);
    }
  }
  update(delta:number){if(!this.ready)return;delta=Math.min(delta,.08);const state=this.room?.state;const own=state?.players?.get(this.room.sessionId);
    if(own&&!this.initialized){this.localPosition.set(own.x,own.y,own.z);this.localYaw=own.yaw;this.initialized=true;}
    if(state?.serverTime&&state.serverTime!==this.lastServerTime){this.lastServerTime=state.serverTime;this.clockOffset=state.serverTime-Date.now();}
    const time=Date.now()+this.clockOffset;
    if(own){
      const action=own.action||'idle';
      if(action!==this.lastAction){
        if(action!=='idle'){
          this.stopWalk();this.pendingStart=null;this.lastMoving=false;
          this.localPosition.set(own.x,own.y,own.z);this.localYaw=own.yaw;
          this.overview=false;this.ui.overview(false);
        }
        this.lastAction=action;
      }
      if(action==='idle')this.advanceWalk(delta);
    }
    this.cameraYaw+=this.ui.yawDelta;this.ui.yawDelta=0;this.cameraDistance=Math.max(2.7,Math.min(8.5,this.cameraDistance+this.ui.zoomDelta));this.ui.zoomDelta=0;
    const alive=new Set<string>();state?.players?.forEach((s:any,id:string)=>{alive.add(id);let v=this.visitors.get(id);if(!v){v=new VisitorView(this.node,this.visitorPrefab,this.world);this.visitors.set(id,v);}const local=id===this.room.sessionId;const position=local?this.localPosition:new Vec3(s.x,s.y,s.z);if(!local&&v.node.position.lengthSqr()>0&&Vec3.distance(v.node.position,position)<5)Vec3.lerp(position,v.node.position,position,Math.min(1,delta*13));const yaw=local?this.localYaw:s.yaw;v.update(s,position,yaw,time,delta,local?this.moving:s.moving);const label=this.world.project(this.camera,position.clone().add(new Vec3(0,1.32,0)));this.ui.label(id,s.nickname+(local?' · 我':''),label.x,label.y,label.visible,local?'visitor self':'visitor');});
    this.visitors.forEach((v,id)=>{if(!alive.has(id)){v.destroy();this.visitors.delete(id);this.ui.removeLabel(id);}});
    if(state?.players){this.world.syncObjects(this.room);this.countTime+=delta;if(this.countTime>.3){this.ui.connection(`${state.players.size} 人同游`,true);this.countTime=0;}}
    this.updateCamera(delta);
    const progress=own?.actionEndsAt>own?.actionStartedAt?(time-own.actionStartedAt)/(own.actionEndsAt-own.actionStartedAt):0;
    const status=this.ritual?heading[this.ritual.kind]:this.pendingStart?'正在开始…':'';
    const hint=this.path.length?'行走中 · 点击其他地面可改道':'点击地面行走 · 点击下方按钮参与仪式';
    this.ui.state(own?.action||'idle',progress,hint,status);
  }
  private updateCamera(delta:number){if(!this.camera)return;const target=this.localPosition.clone().add(new Vec3(0,.8,0));let wanted:Vec3;
    if(this.overview){wanted=new Vec3(23,34,31);target.set(0,0,-2);this.camera.fov=53;}else{
      const underEaves=Math.abs(this.localPosition.x)<10.2&&this.localPosition.z< -6.2;
      const action=this.room?.state?.players?.get(this.room.sessionId)?.action;
      const focused=action&&action!=='idle';
      const distance=Math.min(this.cameraDistance,underEaves?3.6:focused?3.8:8.5);
      const height=underEaves?Math.min(distance*.32,1.15):distance*.58;
      wanted=target.clone().add(new Vec3(Math.sin(this.cameraYaw)*distance,height,Math.cos(this.cameraYaw)*distance));this.camera.fov=58;
    }
    if(!this.initialized&&!this.overview){wanted=new Vec3(15,13,22);target.set(0,.6,-5);}const p=this.camera.node.position.clone();Vec3.lerp(p,p,wanted,Math.min(1,delta*6));this.camera.node.setPosition(p);this.camera.node.lookAt(target);
  }
}
