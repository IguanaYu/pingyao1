const ICONS: Record<string, string> = {
  incense: '<path d="M9 19V7m6 12V7M5 20h14M9 4v-2m6 2V2M6 11h12l-2 9H8z"/>',
  bow: '<circle cx="12" cy="4" r="2"/><path d="m8 10 4 3 4-3M12 7v6m-4 8 4-8 4 8M5 9l3 1m11-1-3 1"/>',
  offering: '<path d="M3 16h18l-3 4H6zM12 16V9m0-2c-5 0-5-6-1-4 0-4 5-3 3 1 4-1 5 4-2 3ZM6 12c3-2 5 1 6 3m6-3c-3-2-5 1-6 3"/>',
  sit: '<circle cx="12" cy="4" r="2"/><path d="M12 7v7m-5-4 5 2 5-2M12 14l-7 5 7 1 7-1zM5 19l-2-3m16 3 2-3"/>',
};
const svg = (key: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ''}</svg>`;

export class DemoInterface {
  root: HTMLElement;
  yawDelta = 0;
  zoomDelta = 0;
  onJoin: (name: string) => void = () => {};
  onAction: (kind: string, offeringType?: string) => void = () => {};
  onCancel: () => void = () => {};
  onGround: (x: number, y: number) => void = () => {};
  onOverview: () => void = () => {};
  private noticeTimer: any;
  private labels = new Map<string, HTMLElement>();
  private ready = false;
  private sound = false;
  private audio: AudioContext | null = null;

  constructor() {
    document.getElementById('temple-ui')?.remove();
    const style = document.createElement('style');
    style.textContent = `
    :root{color-scheme:light;--paper:#f8f4e9;--ink:#263e39;--gold:#a48650;--muted:#7c8578}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none}body{font-family:"Microsoft YaHei","PingFang SC",sans-serif}#temple-ui{position:fixed;inset:0;z-index:20;pointer-events:none;color:var(--ink);font-size:14px}#temple-ui button,#temple-ui input{font:inherit}#temple-ui button{cursor:pointer;touch-action:manipulation}#temple-ui button:focus-visible{outline:3px solid #cfaa6c;outline-offset:3px}.topbar{position:absolute;top:max(22px,env(safe-area-inset-top));left:26px;right:26px;display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.brand{background:#f8f4e9ef;border:1px solid #ffffffb0;border-radius:3px 16px 16px 16px;padding:13px 21px;box-shadow:0 4px 20px #233b3220}.brand small{font-size:10px;letter-spacing:4px;color:#8b7650}.brand h1{font-family:"STKaiti","KaiTi",serif;letter-spacing:5px;font-weight:400;font-size:26px;margin:4px 0 0}.tools{display:flex;gap:8px;align-items:center;pointer-events:auto}.tool,.status-pill{border:1px solid #ffffff99;background:#f8f4e9ee;border-radius:24px;color:var(--ink);padding:10px 15px;font-size:12px;box-shadow:0 2px 14px #183b2920}.status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9b9b85;margin-right:7px}.connected .status-dot{background:#3c8e70;box-shadow:0 0 0 4px #4c9b7620}.status-pill{white-space:nowrap}.tools .sound{width:39px;padding:10px 0}.caption{position:absolute;left:28px;top:132px;font-size:12px;color:#fff7e8;text-shadow:0 1px 5px #193a30;letter-spacing:1px}.bottom-bar{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:auto}.actions{display:flex;background:#f8f4e9f2;border:1px solid #ffffffe0;border-radius:19px;box-shadow:0 8px 35px #243b3430;padding:8px;gap:3px}.rite{border:0;background:transparent;color:#566558;width:92px;min-height:69px;padding:8px 10px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;transition:background .2s,color .2s}.rite svg{height:25px;width:25px}.rite b{font-size:13px;letter-spacing:3px;font-weight:500}.rite.near{background:#e3e8dc;color:#2b5745}.rite:hover{background:#e9e4d4}.action-hint{font-size:12px;max-width:440px;text-align:center;line-height:1.6;color:#fff9ef;text-shadow:0 1px 5px #0f291d;background:#28423880;border-radius:22px;padding:7px 16px}.progress{display:none;background:#f8f4e9f5;border-radius:14px;padding:12px 15px;min-width:260px;box-shadow:0 5px 25px #243b3430;align-items:center;gap:12px}.progress span{flex:1;font-size:13px}.progress button{border:0;background:#e7dfcc;border-radius:8px;color:#526052;padding:7px 12px}.progress-track{height:3px;background:#d8d5c7;border-radius:3px;overflow:hidden;position:absolute;bottom:4px;left:15px;right:15px}.progress-fill{height:100%;width:0;background:#9b8658}.progress{position:relative}.joystick:before{content:'移动';color:#fff9;font-size:11px;position:absolute;bottom:11px;letter-spacing:3px}.control-help{position:absolute;right:26px;bottom:32px;font-size:11px;line-height:1.9;text-align:right;color:#ffffffe0;text-shadow:0 1px 4px #193c2b}.welcome-shade{position:absolute;inset:0;background:linear-gradient(90deg,#102d2873,#18322c10 75%);pointer-events:auto;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}.welcome{width:min(410px,calc(100vw - 36px));background:#f8f4e9f5;border:1px solid #ffffffc0;border-radius:4px 24px 24px 24px;padding:34px 38px;box-shadow:0 25px 90px #18342c45}.welcome .eyebrow{font-size:10px;letter-spacing:5px;color:#9b8151}.welcome h2{font-family:"STKaiti","KaiTi",serif;font-size:37px;font-weight:400;line-height:1.5;letter-spacing:3px;margin:15px 0}.welcome p{font-size:13px;line-height:1.9;color:#79816f;margin:0 0 25px}.welcome label{font-size:11px;color:#7d856f;letter-spacing:2px;display:block;margin-bottom:8px}.welcome input{border:0;border-bottom:1px solid #c9c8b3;border-radius:0;background:transparent;display:block;padding:9px 0 12px;width:100%;outline:none;font-size:16px!important;color:#354b3f}.enter{border:0;color:#f8f5e9;background:#315745;border-radius:10px;padding:14px;width:100%;margin-top:22px;letter-spacing:5px;font-size:14px!important}.enter:disabled{background:#b9bca9;cursor:wait!important}.welcome-note{font-size:10px!important;margin:14px 0 0!important;line-height:1.7!important;letter-spacing:1px}.toast{position:absolute;top:29%;left:50%;transform:translateX(-50%);padding:12px 23px;background:#f8f4e9f5;box-shadow:0 5px 25px #20372925;border-radius:30px;opacity:0;transition:opacity .2s;text-align:center;max-width:90vw;line-height:1.6}.offer-picker{display:none;background:#f8f4e9f7;border:1px solid #fff;border-radius:14px;padding:13px;gap:10px;box-shadow:0 5px 25px #243b3420}.offer-picker button{background:#e8e8da;border:0;padding:13px 20px;color:#355640;border-radius:10px}.world-tag{position:absolute;padding:5px 10px;border-radius:15px;font-size:11px;line-height:1.3;white-space:nowrap;background:#f9f4e4e6;border:1px solid #ffffffc0;color:#4c604c;transform:translate(-50%,-100%);box-shadow:0 2px 12px #243e2320;pointer-events:none}.world-tag.visitor{background:#294c3cba;color:#fff8e9;border:0;font-size:10px;padding:4px 8px}.world-tag.self{background:#a68b52e8}.station-info{font-size:10px;color:#fff8e8;background:#1e392ca0;padding:4px 9px;border-radius:12px}.reconnect{display:none}.modal-route{display:none;position:absolute;top:85px;right:26px;background:#f8f4e9f5;border:1px solid #fff;border-radius:16px;padding:18px 22px;width:260px;pointer-events:auto;box-shadow:0 10px 35px #203c2820}.modal-route h3{font-family:"STKaiti","KaiTi",serif;font-weight:400;letter-spacing:3px;margin:0 0 15px;font-size:20px}.modal-route p{line-height:2.1;font-size:12px;color:#75816b;margin:0}.modal-route strong{color:#3b5945;font-weight:500}.sound-on{background:#dde8d7}.hidden{display:none!important}
    @media(max-width:720px){.topbar{left:14px;right:14px;top:max(14px,env(safe-area-inset-top))}.brand{padding:10px 13px}.brand h1{font-size:20px;letter-spacing:3px}.brand small{font-size:8px;letter-spacing:2px}.tools{gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:190px}.tool,.status-pill{padding:8px 10px;font-size:10px}.tools .sound{width:30px;padding:8px 0}.caption{left:17px;top:110px;font-size:10px}.rite{width:65px;min-height:62px;padding:7px 4px}.rite svg{height:22px;width:22px}.rite b{font-size:12px}.bottom-bar{bottom:max(18px,env(safe-area-inset-bottom));gap:8px}.actions{padding:5px;border-radius:15px}.control-help{bottom:140px;right:17px;font-size:10px}.action-hint{font-size:10px;padding:6px 12px;max-width:280px}.progress{min-width:250px;padding:10px 13px}.welcome{padding:28px}.welcome h2{font-size:32px}.modal-route{right:14px;top:92px;width:240px}.world-tag{font-size:10px}.toast{top:25%;font-size:12px}}`;
    document.head.appendChild(style);
    this.root = document.createElement('div'); this.root.id = 'temple-ui';
    this.root.innerHTML = `
    <div class="topbar"><div class="brand"><small>PINGYAO · CHENGHUANG</small><h1>平遥城隍庙</h1></div><div class="tools"><div class="status-pill" id="connection"><i class="status-dot"></i><span>尚未入院</span></div><button class="tool reconnect" id="reconnect">重新进入</button><button class="tool" id="overview">院落全景</button><button class="tool" id="route">游览指引</button><button class="tool sound" id="sound" aria-label="环境声音">♪</button></div></div>
    <div class="modal-route" id="route-panel"><h3>游庙小记</h3><p><strong>原地 · 敬香</strong><br>献殿供案 · 献花献果<br>城隍殿前 · 礼敬<br>西侧蒲团 · 静坐<br><br>点击地面行走，点仪式自动前往。<br>手机滑动／电脑右键拖动：转动视角。</p></div>
    <div id="world-labels"></div>
    <div class="bottom-bar"><div class="progress" id="progress"><span id="progress-text"></span><button id="cancel">取消</button><div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div></div><div class="offer-picker" id="offer-picker"><button id="flower">献一束鲜花</button><button id="fruit">献一盘鲜果</button></div><div class="actions">${['incense','bow','offering','sit'].map((key,i)=>`<button class="rite" id="action-${key}" data-action="${key}">${svg(key)}<b>${['敬香','礼敬','献供','静坐'][i]}</b></button>`).join('')}</div></div>
    <div class="welcome-shade" id="welcome"><div class="welcome"><div class="eyebrow">相 遇 · 平 遥</div><h2>入一方清静<br>留一份心意</h2><p>与同游者走进城隍庙，敬香、礼敬、献供，或在廊边静坐片刻。</p><label for="nickname">怎么称呼你</label><input id="nickname" maxlength="12" autocomplete="nickname" placeholder="留一个雅称" value="访客${Math.floor(Math.random()*900+100)}"><button class="enter" id="enter" disabled>正在准备庙院…</button><p class="welcome-note" id="welcome-note">建筑与小人加载中，请稍候</p></div></div><div class="toast" id="toast" role="status"></div>`;
    document.body.appendChild(this.root);
    this.el('enter').addEventListener('click', () => this.join());
    this.el('nickname').addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') this.join(); });
    this.el('reconnect').addEventListener('click', () => this.join());
    this.el('overview').addEventListener('click', () => this.onOverview());
    this.el('route').addEventListener('click', () => { const e = this.el('route-panel'); e.style.display = e.style.display === 'block' ? 'none' : 'block'; });
    this.el('sound').addEventListener('click', () => this.toggleSound());
    this.el('cancel').addEventListener('click', () => this.onCancel());
    for (const kind of ['incense','bow','offering','sit']) this.el(`action-${kind}`).addEventListener('click', () => {
      if (kind === 'offering') { const e=this.el('offer-picker'); e.style.display=e.style.display==='flex'?'none':'flex'; }
      else { this.closeOffering(); this.onAction(kind); }
    });
    for (const kind of ['flower','fruit']) this.el(kind).addEventListener('click', () => { this.el('offer-picker').style.display='none'; this.onAction('offering',kind); });
    this.bindControls();
  }
  el(id: string): HTMLElement { return this.root.querySelector(`#${id}`)!; }
  setReady() { this.ready=true; (this.el('enter') as HTMLButtonElement).disabled=false; this.el('enter').textContent='进入院子'; this.el('welcome-note').textContent='与同一院落的访客相遇，自在游览'; }
  loading(text: string) { this.el('welcome-note').textContent=text; }
  private join() { if (!this.ready) return; const name=(this.el('nickname') as HTMLInputElement).value.trim() || '访客'; this.onJoin(name); }
  connecting() { (this.el('enter') as HTMLButtonElement).disabled=true; this.el('enter').textContent='正在入院…'; this.connection('正在连接',false); }
  joined() { this.el('welcome').classList.add('hidden'); this.el('reconnect').style.display='none'; (this.el('enter') as HTMLButtonElement).disabled=false; this.el('enter').textContent='进入院子'; }
  connection(text: string, connected: boolean) { const e=this.el('connection'); e.classList.toggle('connected',connected); e.querySelector('span')!.textContent=text; }
  disconnected(text: string) { this.connection('连接已断开',false); this.el('reconnect').style.display='inline-block'; (this.el('enter') as HTMLButtonElement).disabled=false; this.el('enter').textContent='重新进入'; this.el('welcome-note').textContent=text; this.toast(text); }
  toast(text: string) { const e=this.el('toast'); e.textContent=text; e.style.opacity='1'; clearTimeout(this.noticeTimer); this.noticeTimer=setTimeout(()=>e.style.opacity='0',3200); }
  closeOffering() { this.el('offer-picker').style.display='none'; }
  state(action: string, progress: number, _hint: string, heading: string) {
    const names: any={incense:'正在敬香',bow:'正在礼敬',offering:'正在献供',sit:'静坐片刻，听一院清风'};
    this.el('progress').style.display=(action!=='idle'||heading)?'flex':'none';
    this.el('progress-text').textContent=names[action]||heading;
    this.el('cancel').textContent=action==='sit'?'起身':'取消';
    this.el('progress-fill').style.width=`${Math.max(0,Math.min(1,progress))*100}%`;
    for(const key of ['incense','bow','offering','sit']) this.el(`action-${key}`).classList.toggle('near',key===action);
  }
  overview(enabled: boolean) { this.el('overview').textContent=enabled?'返回人物':'院落全景'; }
  label(id: string, text: string, x: number, y: number, visible: boolean, kind='') {
    let e=this.labels.get(id); if(!e) { e=document.createElement('div'); e.className=`world-tag ${kind}`; this.el('world-labels').appendChild(e); this.labels.set(id,e); }
    const clearOfChrome=y>(innerWidth<=720?132:122)&&y<innerHeight-110&&x>28&&x<innerWidth-28;
    e.textContent=text; e.style.display=visible&&clearOfChrome?'block':'none'; e.style.left=`${x}px`; e.style.top=`${y}px`;
  }
  removeLabel(id: string) { this.labels.get(id)?.remove(); this.labels.delete(id); }
  chime() { if(!this.sound||!this.audio) return; const ctx=this.audio; const osc=ctx.createOscillator(); const gain=ctx.createGain(); osc.type='sine'; osc.frequency.value=523.25; gain.gain.setValueAtTime(.035,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.4); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+1.5); }
  private toggleSound() {
    this.sound=!this.sound; this.el('sound').classList.toggle('sound-on',this.sound);
    if(!this.audio) { this.audio=new AudioContext(); const ctx=this.audio; const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate); const values=buffer.getChannelData(0); let last=0; for(let i=0;i<values.length;i++){ last=(last+Math.random()*.04-.02)*.98;values[i]=last; } const source=ctx.createBufferSource(); source.buffer=buffer; source.loop=true; const filter=ctx.createBiquadFilter(); filter.type='lowpass';filter.frequency.value=500;const gain=ctx.createGain();gain.gain.value=.15;source.connect(filter).connect(gain).connect(ctx.destination);source.start(); }
    if(this.sound) this.audio.resume(); else this.audio.suspend();
  }
  private bindControls() {
    let pointer: { id: number; x: number; y: number; lastX: number; drag: boolean; turn: boolean; time: number } | null = null;
    const isCanvas = (e: Event) => e.target instanceof HTMLCanvasElement;
    document.addEventListener('pointerdown', e => {
      if (!isCanvas(e) || pointer || !e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
      const turn = e.pointerType === 'mouse' && e.button === 2;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, drag: turn, turn, time: e.timeStamp };
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    });
    document.addEventListener('pointermove', e => {
      if (!pointer || e.pointerId !== pointer.id) return;
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 9) pointer.drag = true;
      if (pointer.drag && (pointer.turn || e.pointerType !== 'mouse')) {
        this.yawDelta -= (e.clientX - pointer.lastX) * .005;
        pointer.lastX = e.clientX;
      }
    });
    document.addEventListener('pointerup', e => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const tap = !pointer.drag && e.timeStamp - pointer.time < 500 && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) <= 9;
      pointer = null;
      if (tap) this.onGround(e.clientX, e.clientY);
    });
    const cancel = (e: PointerEvent) => { if (e.pointerId === pointer?.id) pointer = null; };
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('lostpointercapture', cancel);
    window.addEventListener('blur', () => { pointer = null; });
    document.addEventListener('contextmenu', e => { if (isCanvas(e)) e.preventDefault(); });
    document.addEventListener('wheel', e => { if (isCanvas(e)) this.zoomDelta += e.deltaY * .007; }, { passive: true });
  }
}
