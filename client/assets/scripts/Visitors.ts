import {Node, Prefab, instantiate, Vec3} from 'cc';
import {DemoWorld, shape} from './World';
const degrees = 180 / Math.PI;
function smooth(t:number) {t = Math.max(0, Math.min(1,t)); return t*t*(3-2*t);}
function find(root:Node,name:string):Node|null {if(root.name===name)return root; for(const c of root.children){const n=find(c,name);if(n)return n;} return null;}

export class VisitorView {
  node:Node; visual:Node; torso:Node|null; left:Node|null; right:Node|null;
  legL:Node|null; legR:Node|null; head:Node|null; robe:Node|null; held:Node; cushion:Node;
  private socketL:Node|null; private socketR:Node|null;
  private heldType=''; private phase=0;
  private handL=new Vec3(); private handR=new Vec3(); private handMid=new Vec3();
  constructor(parent:Node,prefab:Prefab,private world:DemoWorld) {
    this.node=new Node('Visitor'); parent.addChild(this.node);
    this.visual=instantiate(prefab); this.node.addChild(this.visual);
    // 随身蒲团：静坐时“自己拿出来”，其余状态隐藏。
    this.cushion=shape(this.node,'蒲团','cylinder','#b4aa79',new Vec3(0,.06,0),new Vec3(.72,.12,.72));
    this.cushion.active=false;
    this.torso=find(this.visual,'Torso'); this.left=find(this.visual,'Arm_L'); this.right=find(this.visual,'Arm_R');
    this.legL=find(this.visual,'Leg_L'); this.legR=find(this.visual,'Leg_R'); this.head=find(this.visual,'HeadPivot');
    this.robe=find(this.visual,'RobePivot'); this.socketL=find(this.visual,'HandSocket_L'); this.socketR=find(this.visual,'HandSocket_R');
    this.held=new Node('HeldObject'); (this.torso||this.visual).addChild(this.held);
  }
  update(state:any,position:Vec3,yaw:number,time:number,delta:number,moving:boolean) {
    this.node.setPosition(position); this.node.setRotationFromEuler(0,yaw*degrees,0);
    this.phase+=delta*(moving?9:1);
    const action=state.action||'idle';
    this.cushion.active=action==='sit';
    const age=Math.max(0,(time-state.actionStartedAt)/1000);
    let bend=0, armX=0, armZ=0, join=0, sit=0; let held='';
    if(action==='incense') {
      const enter=smooth(age/.75), leave=1-smooth((age-3.65)/1.15);
      const raise=smooth((age-.85)/.65)*(1-smooth((age-2.25)/.55));
      const weight=enter*leave;
      armX=-(74+raise*45)*weight; armZ=25*weight; join=.08*weight;
      bend=10*Math.sin(Math.min(1,Math.max(0,(age-2.65)/1.05))*Math.PI);
      held='incense';
    } else if(action==='bow') {
      const weight=smooth(age/.55)*(1-smooth((age-2.7)/.7));
      armX=-65*weight; armZ=27*weight; join=.08*weight;
      bend=30*Math.sin(Math.min(1,Math.max(0,(age-.55)/2.15))*Math.PI);
    } else if(action==='offering') {
      const weight=smooth(age/.7)*(1-smooth((age-2.5)/1.0));
      armX=-76*weight; armZ=20*weight;
      bend=12*Math.sin(Math.min(1,age/3.5)*Math.PI);
      held=age<2.45?(state.offeringType||'fruit'):'';
    } else if(action==='sit') {
      sit=smooth(age/.65); armX=-35*sit; armZ=25*sit; bend=3*sit;
    }
    const walk=moving&&action==='idle'?Math.sin(this.phase)*23:0;
    this.visual.setPosition(0,moving&&action==='idle'?Math.abs(Math.sin(this.phase))*.014:0,0);
    this.torso?.setPosition(0,.46-.16*sit,0);
    this.torso?.setRotationFromEuler(bend,0,0);
    this.robe?.setScale(1,1-.28*sit,1);
    this.left?.setPosition(-.14+join,.16,0); this.right?.setPosition(.14-join,.16,0);
    // Positive local Z brings the left hand inward; negative Z does the same for the right.
    this.left?.setRotationFromEuler(armX-walk*.5,0,armZ);
    this.right?.setRotationFromEuler(armX+walk*.5,0,-armZ);
    // Fold the short legs across the lap; the feet rest just above the cushion.
    this.legL?.setPosition(-.073,.30-.13*sit,0); this.legR?.setPosition(.073,.30-.13*sit,0);
    this.legL?.setRotationFromEuler(-62*sit+walk,0,63*sit);
    this.legR?.setRotationFromEuler(-62*sit-walk,0,-63*sit);
    this.head?.setRotationFromEuler(bend*.12,0,0);
    if(held!==this.heldType) {
      for(const child of [...this.held.children])child.destroy();
      this.heldType=held;
      if(held==='incense')this.world.incense(this.held); else if(held)this.world.offering(this.held,held);
    }
    // Compute the actual palm midpoint in Torso space so props follow the raise/lean animation.
    if(this.left&&this.right&&this.socketL&&this.socketR) {
      Vec3.transformQuat(this.handL,this.socketL.position,this.left.rotation); this.handL.add(this.left.position);
      Vec3.transformQuat(this.handR,this.socketR.position,this.right.rotation); this.handR.add(this.right.position);
      Vec3.add(this.handMid,this.handL,this.handR); this.handMid.multiplyScalar(.5);
      this.held.setPosition(this.handMid.x,this.handMid.y+.003,this.handMid.z+.006);
    } else this.held.setPosition(0,.12,.28);
    if (held==='incense') {
      let i=0;
      for (const smoke of this.held.children) if (smoke.name.startsWith('Smoke')) {
        const t=(age*.48+i++*.24)%1;
        smoke.setPosition(Math.sin(age*2+i)*.035,.3+t*.45,0);
        smoke.setScale(.035+t*.095,.05+t*.1,.035+t*.095);
      }
    }
    const propScale=held==='incense'?.8:.65;
    this.held.setScale(propScale,propScale,propScale);
  }
  destroy(){this.node.destroy();}
}
