/* Merge Gems — local-first mobile interface. */
(() => {
  'use strict';
  const {Game,GEMS,STAGES,W,H,LIMIT,clamp}=MergeGems;
  const $=id=>document.getElementById(id),format=n=>Math.floor(n).toLocaleString('pt-BR');
  const canvas=$('board'),ctx=canvas.getContext('2d'),dialog=$('dialog');
  const cavernArt=typeof Image!=='undefined'?new Image():null;
  if(cavernArt)cavernArt.src='crystal-cavern.png';
  const KEY='merge-gems.mobile.v1',reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let profile={unlocked:0,stars:Array(10).fill(0),discovered:[1],best:0,sound:false,tutorial:false,save:null};
  let storageOK=true;
  try{
    const p=JSON.parse(localStorage.getItem(KEY));
    if(p&&typeof p==='object'){
      profile.unlocked=Number.isInteger(p.unlocked)?clamp(p.unlocked,0,9):0;
      profile.stars=Array.from({length:10},(_,i)=>Number.isInteger(p.stars?.[i])?clamp(p.stars[i],0,3):0);
      profile.discovered=[...new Set([1,...(Array.isArray(p.discovered)?p.discovered:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=10)])];
      profile.best=Number.isFinite(p.best)?Math.max(0,p.best):0;profile.sound=p.sound===true;profile.tutorial=p.tutorial===true;
      if(p.save){try{profile.save=Game.restore(p.save).snapshot();}catch{profile.save=null;}}
    }
  }catch{storageOK=false;}
  let game=null,paused=true,activePower=null,pointer=null,aim=W/2,particles=[],labels=[];
  let scale=1,offsetX=0,offsetY=0,frameTime=0,accumulator=0,saveTime=0,toastTimer;
  let audio=null,audioMaster=null,voiceCount=0,modalClose=null;
  const lastSound={};
  let wild=null,pendingFinish=false;
  let bursts=[],effectTime=0,comboBanner=null;
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(profile));}catch{storageOK=false;} $('save-status').textContent=storageOK?'Seu progresso fica salvo neste aparelho.':'Salvamento indisponível neste navegador. Mantenha a página aberta.';}
  function save(){if(game?.status==='playing')profile.save=game.snapshot();persist();}
  function unlockAudio(){
    if(!profile.sound)return;
    try{
      if(!audio){
        audio=new (window.AudioContext||window.webkitAudioContext)();
        audioMaster=audio.createGain();audioMaster.gain.value=.42;
        const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.18;
        audioMaster.connect(limiter);limiter.connect(audio.destination);
      }
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch{/* Audio is optional. */}
  }
  function sound(kind,level=1,multiplier=1){
    if(!profile.sound)return;
    unlockAudio();if(!audio||!audioMaster)return;
    const now=audio.currentTime;if(now-(lastSound[kind]??-10)<(kind==='land'?.09:.035))return;lastSound[kind]=now;
    // Short, dry crystal strikes: no repeated echo or high-pitched sweeps.
    function tone(f,delay,length,volume,type='sine',end=f){
      if(voiceCount>=96)return;
      const t=now+delay,o=audio.createOscillator(),gain=audio.createGain();voiceCount++;
      o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(end,t+length);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+length);
      o.connect(gain);gain.connect(audioMaster);o.start(t);o.stop(t+length+.015);
      o.onended=()=>{o.disconnect();gain.disconnect();voiceCount--;};
    }
    function bell(f,delay=0,strength=1){tone(f,delay,.23,.095*strength);tone(f*2.01,delay,.09,.026*strength);tone(f*3.93,delay,.035,.006*strength);}
    if(kind==='drop'){tone(330,0,.045,.035);}
    else if(kind==='land'){tone(230,0,.045,.03);tone(970,0,.027,.013);}
    else if(kind==='merge'){
      const notes=[523.25,587.33,659.25,783.99,880];
      const f=notes[Math.min(4,multiplier-1)];bell(f);tone(f*.5,0,.12,.023);
      if(multiplier>=3)bell(f*1.5,.09,.35);
    }
    else if(kind==='wild'){
      [392,523,659,784,1046].forEach((f,i)=>bell(f,i*.09,.8));
      [262,330,392].forEach(f=>tone(f,.4,.5,.022));
    }
    else if(kind==='won')[523,659,784,1046].forEach((f,i)=>bell(f,i*.12,.8));
    else if(kind==='lost')[330,262].forEach((f,i)=>tone(f,i*.13,.2,.045));
  }
  function soundButton(){$('sound').setAttribute('aria-pressed',String(profile.sound));$('sound').setAttribute('aria-label',profile.sound?'Desativar som':'Ativar som');$('sound').textContent=profile.sound?'♫':'♪';if(audioMaster)audioMaster.gain.setTargetAtTime(profile.sound?.42:0,audio.currentTime,.02);}
  $('sound').onclick=()=>{profile.sound=!profile.sound;soundButton();sound('merge',4);persist();};
  function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
  function openModal(kicker,title,content,actions,onClose){
    if(dialog.open)dialog.close();modalClose=onClose||null;
    $('dialog-kicker').textContent=kicker;$('dialog-title').textContent=title;$('dialog-content').replaceChildren();
    if(typeof content==='string')$('dialog-content').innerHTML=content;else $('dialog-content').append(content);
    $('dialog-actions').replaceChildren();
    for(const [label,callback,secondary] of actions){const b=document.createElement('button');b.className=secondary?'secondary':'primary';b.textContent=label;b.onclick=()=>{dialog.close();modalClose=null;callback();};$('dialog-actions').append(b);}
    dialog.showModal();
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(modalClose){const fn=modalClose;modalClose=null;dialog.close();fn();}});
  function cancelPointer(){if(pointer&&canvas.hasPointerCapture?.(pointer.id))canvas.releasePointerCapture(pointer.id);pointer=null;game?.endDrag();}
  function home(){cancelPointer();paused=true;activePower=null;save();$('play').hidden=true;$('home').hidden=false;$('home-best').textContent=format(profile.best);$('home-collection').textContent=`${profile.discovered.length} / 10`;$('continue').hidden=!profile.save;resize();}
  $('home-link').onclick=e=>{e.preventDefault();if(game&&!$('play').hidden)pause();else home();};
  function help(after=home){
    openModal('LEVE O SEU TEMPO','Uma gema de cada vez',`<ol class="steps"><li><strong>Mire e solte.</strong> Toque no tabuleiro, deslize para escolher a posição e solte para lançar.</li><li><strong>Combine iguais.</strong> Arraste uma gema até outra do mesmo nível. As duas viram uma joia maior.</li><li><strong>Faça combos.</strong> Fusões em até 2 segundos aumentam os pontos, até ×5.</li><li><strong>Olhe a linha.</strong> Uma pilha acima dela por 3 segundos encerra a partida. Combine as gemas para abrir espaço.</li></ol><p>Em cada câmara, alcance a meta. Complete a meta para conquistar as estrelas da câmara. No infinito, tente superar seu recorde.</p>`,[['Vamos jogar',()=>{profile.tutorial=true;persist();after();}]],after);
    const rule=document.createElement('p');rule.className='reward';rule.textContent='WILD: junte duas Lendárias (nível 10) para limpar todas as gemas da tela e ganhar 15.000 pontos, multiplicados pelo combo.';$('dialog-content').append(rule);
  }
  $('help').onclick=()=>help(home);
  function start(mode,stage=0,resume=false){
    game=resume?Game.restore(profile.save):new Game(mode,stage);
    paused=false;activePower=null;pointer=null;particles=[];labels=[];bursts=[];comboBanner=null;accumulator=0;aim=W/2;wild=null;pendingFinish=false;
    $('home').hidden=true;$('play').hidden=false;resize();updateHUD();save();
    if(!profile.tutorial){paused=true;help(()=>{paused=false;toast('Solte sua primeira gema no tabuleiro.');});}
  }
  function requestStart(mode,stage){
    if(profile.save)openModal('NOVA PARTIDA','Começar de novo?','<p>A partida em andamento será substituída. Suas câmaras, estrelas e gemas descobertas continuam salvas.</p>',[['Começar nova partida',()=>start(mode,stage)],['Voltar',home,true]],home);
    else start(mode,stage);
  }
  $('continue').onclick=()=>start('campaign',0,true);
  $('endless').onclick=()=>requestStart('endless',0);
  function chambers(){
    const grid=document.createElement('div');grid.className='chambers';
    STAGES.forEach(([name,target],i)=>{const b=document.createElement('button');b.disabled=i>profile.unlocked;b.innerHTML=`<strong>${String(i+1).padStart(2,'0')} · ${i>profile.unlocked?'Fechada':name}</strong><small>${format(target)} pontos</small><div class="stars">${'★'.repeat(profile.stars[i])}${'☆'.repeat(3-profile.stars[i])}</div>`;b.onclick=()=>{dialog.close();requestStart('campaign',i);};grid.append(b);});
    openModal('SUA EXPEDIÇÃO','As dez câmaras',grid,[['Voltar ao início',home,true]],home);
  }
  $('campaign').onclick=chambers;
  function collection(){
    const list=document.createElement('div');list.className='gem-list';
    GEMS.forEach((g,i)=>{const known=profile.discovered.includes(i+1),row=document.createElement('div');row.className='gem-entry'+(known?'':' locked');const c=document.createElement('canvas');c.width=c.height=90;drawGem(c.getContext('2d'),45,45,30,i+1,false);const name=document.createElement('div');name.innerHTML=`${known?g[0]:'Não descoberta'}<small>Nível ${i+1}</small>`;row.append(c,name);list.append(row);});
    openModal('DE RUBI A LENDÁRIA','Seu pequeno tesouro',list,[['Voltar',home,true]],home);
  }
  $('collection').onclick=collection;
  function resume(){paused=false;accumulator=0;updateHUD();}
  function pause(){if(!game||game.status!=='playing')return;paused=true;cancelPointer();save();openModal(game.mode==='campaign'?`CÂMARA ${game.stage+1} · ${STAGES[game.stage][0]}`:'MODO INFINITO','Jogo pausado','<p>A partida foi guardada. Volte quando quiser.</p>',[['Continuar',resume],[profile.sound?'Desativar som':'Ativar som',()=>{$('sound').onclick();pause();},true],['Como jogar',()=>help(resume),true],['Sair para o início',home,true]],resume);}
  $('pause').onclick=pause;
  function finish(){
    paused=true;cancelPointer();profile.save=null;
    if(game.mode==='endless')profile.best=Math.max(profile.best,game.score);
    if(game.status==='won'){
      const stars=game.used===0?3:game.used===1?2:1;profile.stars[game.stage]=Math.max(profile.stars[game.stage],stars);profile.unlocked=Math.max(profile.unlocked,Math.min(9,game.stage+1));persist();
      const last=game.stage===9;
      openModal(last?'EXPEDIÇÃO CONCLUÍDA':`CÂMARA ${String(game.stage+1).padStart(2,'0')} ABERTA`,last?'As dez câmaras são suas.':'Uma nova porta se abre.',`<div class="stars" style="font-size:28px">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><strong class="result-score">${format(game.score)}</strong><p>${game.merges} fusões · maior combo ×${game.maxCombo}</p><div class="reward">${last?'Continue descobrindo gemas no modo infinito.':'A próxima câmara começa com o tabuleiro livre.'}</div>`,[[last?'Jogar no infinito':'Próxima câmara',()=>start(last?'endless':'campaign',last?0:game.stage+1)],['Voltar às câmaras',()=>{home();chambers();},true]]);
    }else{
      persist();openModal('A PILHA CHEGOU AO LIMITE','Toda joia tem um recomeço.',`<strong class="result-score">${format(game.score)}</strong><p>${game.merges} fusões · maior combo ×${game.maxCombo}</p><p>${game.mode==='campaign'?`Faltaram ${format(Math.max(0,STAGES[game.stage][1]-game.score))} pontos para abrir esta câmara.`:`Seu recorde: ${format(profile.best)} pontos.`}</p>`,[['Tentar novamente',()=>start(game.mode,game.stage)],['Voltar ao início',home,true]]);
    }
  }
  function updateHUD(){
    if(!game)return;
    $('score').textContent=format(game.score);$('combo').textContent='×'+(game.time<=game.comboUntil?Math.min(5,game.combo)||1:1);
    $('goal-label').textContent=game.mode==='campaign'?`META · ${format(STAGES[game.stage][1])}`:`RECORDE · ${format(Math.max(profile.best,game.score))}`;
    $('progress').style.width=Math.min(100,100*game.score/(game.mode==='campaign'?STAGES[game.stage][1]:Math.max(1200,profile.best,game.score)))+'%';
  }
  function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-offsetX)/scale,y:(e.clientY-r.top-offsetY)/scale};}
  canvas.addEventListener('pointerdown',e=>{
    if(paused||wild||!game||game.status!=='playing'||pointer||e.button>0)return;e.preventDefault();
    const p=point(e);if(p.x<0||p.x>W||p.y<0||p.y>game.height)return;
    unlockAudio();
    if(activePower){const g=game.hit(p.x,p.y);if(game.power(activePower,g?.id)){activePower=null;events();updateHUD();save();}else toast(g?.level===10?'A Lendária já está no último nível.':'Toque diretamente em uma gema.');return;}
    const g=game.startDrag(p.x,p.y);pointer={id:e.pointerId,drag:!!g,dx:g?p.x-g.x:0,dy:g?p.y-g.y:0,lastX:p.x,lastY:p.y,lastTime:e.timeStamp,vx:0,vy:0};aim=clamp(p.x,20,W-20);canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const p=point(e);aim=clamp(p.x,20,W-20);if(pointer.drag){const dt=Math.max(.008,(e.timeStamp-pointer.lastTime)/1000);pointer.vx=clamp((p.x-pointer.lastX)/dt*.45,-240,240);pointer.vy=clamp((p.y-pointer.lastY)/dt*.45,-240,240);pointer.lastX=p.x;pointer.lastY=p.y;pointer.lastTime=e.timeStamp;game.moveDrag(p.x-pointer.dx,p.y-pointer.dy);}});
  canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const wasDrag=pointer.drag;if(wasDrag){const fresh=e.timeStamp-pointer.lastTime<120;game.endDrag(fresh?pointer.vx:0,fresh?pointer.vy:0);}cancelPointer();if(!wasDrag&&!paused){game.drop(aim);events();updateHUD();save();}});
  canvas.addEventListener('pointercancel',cancelPointer);canvas.addEventListener('lostpointercapture',()=>{pointer=null;game?.endDrag();});
  canvas.addEventListener('keydown',e=>{if(paused||!game)return;if(['ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')aim=clamp(aim-16,20,W-20);else if(e.key==='ArrowRight')aim=clamp(aim+16,20,W-20);else{game.drop(aim);events();save();}}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game?.status==='playing'&&!paused&&!dialog.open)pause();else save();}});
  window.addEventListener('pagehide',save);
  function events(){
    for(const e of game.events.splice(0)){
      if(e.type==='drop'||e.type==='land')sound(e.type,e.level||1);
      if(e.type==='merge'||e.type==='burst'){
        if(!reduced){
          bursts.push({x:e.x,y:e.y,r:GEMS[e.level-1][3],life:1,color:GEMS[e.level-1][1]});
          for(let i=0;i<28;i++){const a=i*Math.PI*2/28,s=65+Math.random()*150;particles.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:1,size:1.3+Math.random()*2.2,angle:a,color:i%3===0?GEMS[e.level-1][1]:'#ffdf76'});}
          particles=particles.slice(-420);bursts=bursts.slice(-20);
        }
        if(e.multiplier>=3)comboBanner={life:1.3,multiplier:e.multiplier};
        if(e.points){labels.push({x:e.x,y:e.y,text:`+${format(e.points)}${e.multiplier>1?'  ×'+e.multiplier:''}`,life:1});if(!e.legendary)sound('merge',e.level,e.multiplier);}
      }
      if((e.type==='merge'||e.type==='discover')&&!profile.discovered.includes(e.level)){profile.discovered.push(e.level);toast(`${GEMS[e.level-1][0]} descoberta!`);}
      if(e.type==='wild'){
        cancelPointer();activePower=null;wild={life:1.8,points:e.points};
        if(!reduced)for(const g of e.cleared.slice(0,60))for(let i=0;i<4;i++){const a=Math.random()*Math.PI*2;particles.push({x:g.x,y:g.y,vx:Math.cos(a)*150,vy:Math.sin(a)*150,life:1,size:2.5,angle:a,color:'#ffda55'});}
        particles=particles.slice(-420);
        sound('wild');toast('WILD! Todas as gemas foram removidas.');
        if(game.status!=='playing')profile.save=null;save();
      }
      if(e.type==='won'||e.type==='lost'){if(wild)pendingFinish=true;else{sound(e.type);finish();}}
      if(e.type==='power')sound('merge',7);
    }
  }
  function gemAngle(i,sides){return -Math.PI/2+(sides===8?Math.PI/8:0)+i*Math.PI*2/sides;}
  function pathGem(c,x,y,r,sides){c.beginPath();for(let i=0;i<sides;i++){const a=gemAngle(i,sides);c[i?'lineTo':'moveTo'](x+Math.cos(a)*r,y+Math.sin(a)*r);}c.closePath();}
  function sparkle(c,x,y,size){c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size*.23,y-size*.23);c.lineTo(x+size,y);c.lineTo(x+size*.23,y+size*.23);c.lineTo(x,y+size);c.lineTo(x-size*.23,y+size*.23);c.lineTo(x-size,y);c.lineTo(x-size*.23,y-size*.23);c.closePath();c.fill();}
  function drawGem(c,x,y,r,level,number=true,shine=0){
    const [,hi,lo,,sides]=GEMS[level-1];c.save();
    const gold=c.createLinearGradient(x-r,y-r,x+r,y+r);gold.addColorStop(0,'#ffffbb');gold.addColorStop(.22,'#ffbe0a');gold.addColorStop(.43,'#955000');gold.addColorStop(.52,'#fff7a6');gold.addColorStop(.78,'#d38000');gold.addColorStop(1,'#ffe66a');
    pathGem(c,x,y,r,sides);c.shadowColor='#000b';c.shadowBlur=5;c.shadowOffsetY=3;c.fillStyle=gold;c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle='#ffeeb3';c.lineWidth=.8;c.stroke();
    const face=r*.92,inner=r*.54;
    const grad=c.createLinearGradient(x-face,y-face,x+face,y+face);grad.addColorStop(0,hi);grad.addColorStop(.4,lo);grad.addColorStop(.75,hi);grad.addColorStop(1,lo);
    pathGem(c,x,y,face,sides);c.fillStyle=grad;c.fill();c.strokeStyle='#fff9ba';c.lineWidth=.8;c.stroke();
    for(let i=0;i<sides;i++){const a=gemAngle(i,sides),b=a+Math.PI*2/sides;c.beginPath();c.moveTo(x+Math.cos(a)*face,y+Math.sin(a)*face);c.lineTo(x+Math.cos(b)*face,y+Math.sin(b)*face);c.lineTo(x+Math.cos(b)*inner,y+Math.sin(b)*inner);c.lineTo(x+Math.cos(a)*inner,y+Math.sin(a)*inner);c.closePath();c.fillStyle=['#ffffff88','#ffffff25','#00000060','#ffffff44','#00000055'][i%5];c.fill();c.strokeStyle='#ffffff45';c.lineWidth=.45;c.stroke();}
    pathGem(c,x,y,inner,sides);c.strokeStyle='#ffffffa0';c.lineWidth=.7;c.stroke();
    // Split each bezel into crisp triangular cuts around an offset table.
    for(let i=0;i<sides;i++){
      const a=gemAngle(i,sides),b=a+Math.PI*2/sides,m=(a+b)/2;
      const p={x:x+Math.cos(a)*face,y:y+Math.sin(a)*face},q={x:x+Math.cos(b)*face,y:y+Math.sin(b)*face},v={x:x+Math.cos(m)*inner*.85,y:y+Math.sin(m)*inner*.85};
      const cut=c.createLinearGradient(p.x,p.y,v.x,v.y);cut.addColorStop(0,i%3===0?'#ffffffd0':'#ffffff12');cut.addColorStop(1,i%2?'#00000060':'#ffffff10');
      c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.lineTo(v.x,v.y);c.closePath();c.fillStyle=cut;c.fill();c.strokeStyle='#ffffff38';c.lineWidth=.35;c.stroke();
    }
    // Deterministic inclusions stay inside the cut face, without shimmering noise.
    c.save();pathGem(c,x,y,face,sides);c.clip();
    for(let i=0;i<9;i++){const a=i*2.399+level,d=Math.sqrt((i+.5)/9)*r*.6,px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;c.fillStyle=i%4===0?'#ffffffaa':'#ffffff30';const size=i%4===0?.65:.35;c.fillRect(px,py,size,size);}
    if(shine&&!reduced){
      const sweep=((shine*.28)%1)*r*4-r*2;
      const light=c.createLinearGradient(x+sweep-r*.2,y,x+sweep+r*.2,y);light.addColorStop(0,'#fffacd00');light.addColorStop(.5,'#fffacd50');light.addColorStop(1,'#fffacd00');c.fillStyle=light;c.fillRect(x-r,y-r,r*2,r*2);
    }
    c.restore();
    if(shine&&!reduced){const glint=Math.max(0,Math.sin(shine*1.7+level)-.7)/.3;c.save();c.globalAlpha=glint;c.fillStyle='#fffce6';c.shadowColor='#fff2af';c.shadowBlur=7;sparkle(c,x-r*.35,y-r*.61,Math.max(3,r*.17));c.restore();}
    c.beginPath();c.moveTo(x-r*.28,y-r*.48);c.lineTo(x-r*.06,y-r*.48);c.strokeStyle='#ffffffcc';c.lineWidth=1.5;c.stroke();
    c.restore();
  }
  function resize(){if($('play').hidden||!game)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);scale=rect.width/W;offsetX=offsetY=0;game.resizeHeight(rect.height/scale);ctx.setTransform(dpr,0,0,dpr,0,0);}
  new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);
  function render(dt){
    if(!game||$('play').hidden)return;
    const H=game.height;
    const rect=canvas.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);ctx.save();ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#08020f');bg.addColorStop(.6,'#130820');bg.addColorStop(1,'#0c0510');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    if(cavernArt?.complete&&cavernArt.naturalWidth){ctx.drawImage(cavernArt,0,0,W,H);ctx.fillStyle='#09051138';ctx.fillRect(0,0,W,H);}
    ctx.strokeStyle='#eac47e33';ctx.lineWidth=1;ctx.strokeRect(1,1,W-2,H-2);
    ctx.save();ctx.setLineDash([5,6]);ctx.strokeStyle=game.danger>0?'#f17692':'#eac47e44';ctx.beginPath();ctx.moveTo(10,LIMIT);ctx.lineTo(W-10,LIMIT);ctx.stroke();ctx.restore();
    ctx.font='9px Trebuchet MS';ctx.textAlign='right';ctx.fillStyle=game.danger>0?'#ffabbc':'#b1a3c599';ctx.fillText(game.danger>0?`LIBERE ESPAÇO · ${Math.max(1,Math.ceil(3-game.danger))}s`:'LIMITE DA PILHA',W-12,LIMIT-9);
    if(game.danger>0){ctx.fillStyle='#f1769212';ctx.fillRect(0,LIMIT,W,H-LIMIT);}
    if(game.status==='playing'){
      const r=GEMS[game.current-1][3],ax=clamp(aim,r,W-r);ctx.save();ctx.globalAlpha=pointer?.drag?0:.55;drawGem(ctx,ax,36,r,game.current);ctx.setLineDash([3,6]);ctx.strokeStyle='#eac47e40';ctx.beginPath();ctx.moveTo(ax,36+r+6);ctx.lineTo(ax,H-8);ctx.stroke();ctx.restore();
    }
    for(const g of game.gems){
      if(!reduced&&g.vy>170&&g.id!==game.dragId){ctx.save();const trail=ctx.createLinearGradient(g.x,g.y-g.r-32,g.x,g.y);trail.addColorStop(0,'#ffdf7000');trail.addColorStop(1,'#ffdf702b');ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(g.x-g.r*.5,g.y);ctx.lineTo(g.x,g.y-g.r-Math.min(55,g.vy*.065));ctx.lineTo(g.x+g.r*.5,g.y);ctx.closePath();ctx.fill();ctx.restore();}
      if(g.id===game.dragId){ctx.save();ctx.strokeStyle='#ffe79c';ctx.shadowColor='#ffc640';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(g.x,g.y,g.r+5,0,Math.PI*2);ctx.stroke();ctx.restore();}
      drawGem(ctx,g.x,g.y,g.r,g.level,true,effectTime+g.id*.37);
    }
    if(game.gems.length===0&&game.score===0){ctx.textAlign='center';ctx.fillStyle='#eac47eaa';ctx.font='23px Georgia';ctx.fillText('Tudo começa aqui.',W/2,H*.57);ctx.font='11px Trebuchet MS';ctx.fillStyle='#b1a3c5';ctx.fillText('Mire. Solte. Descubra.',W/2,H*.57+25);}
    if(!paused){effectTime+=dt;particles=particles.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt*1.2;return p.life>0;});bursts=bursts.filter(b=>{b.life-=dt*1.8;return b.life>0;});labels=labels.filter(p=>{p.y-=reduced?0:32*dt;p.life-=dt*.9;return p.life>0;});if(comboBanner){comboBanner.life-=dt;if(comboBanner.life<=0)comboBanner=null;}}
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(const b of bursts){const age=1-b.life;ctx.globalAlpha=b.life*.65;ctx.strokeStyle='#ffdf72';ctx.lineWidth=2.5*b.life;ctx.shadowColor=b.color;ctx.shadowBlur=14;ctx.beginPath();ctx.arc(b.x,b.y,b.r*(.55+age*1.8),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff3b7';ctx.globalAlpha=Math.max(0,b.life-.6)*.8;sparkle(ctx,b.x,b.y,b.r*1.5);}
    ctx.shadowBlur=0;
    for(const p of particles){ctx.globalAlpha=p.life;ctx.fillStyle=p.color;sparkle(ctx,p.x,p.y,(p.size||2)*(p.life+.3));}
    ctx.restore();
    for(const p of labels){ctx.save();ctx.globalAlpha=p.life;ctx.font='bold 19px Georgia';ctx.textAlign='center';ctx.strokeStyle='#542704';ctx.lineWidth=3;ctx.strokeText(p.text,clamp(p.x,70,W-70),p.y);ctx.fillStyle='#fff0a2';ctx.fillText(p.text,clamp(p.x,70,W-70),p.y);ctx.restore();}
    if(comboBanner&&!wild){ctx.save();ctx.globalAlpha=Math.min(1,comboBanner.life*2);ctx.textAlign='center';ctx.font='bold 26px Georgia';ctx.strokeStyle='#542704';ctx.lineWidth=5;const title=comboBanner.multiplier===5?'COMBO MÁXIMO!':'COMBO ×'+comboBanner.multiplier;ctx.strokeText(title,W/2,148);ctx.fillStyle='#ffe77e';ctx.shadowColor='#d88a12';ctx.shadowBlur=reduced?0:14;ctx.fillText(title,W/2,148);ctx.restore();}
    if(wild){
      const t=1.8-wild.life;ctx.fillStyle='#1c090ab8';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(W/2,H*.46);
      if(!reduced){ctx.save();ctx.rotate(t*.25);const ray=ctx.createLinearGradient(0,0,0,-H);ray.addColorStop(0,'#ffe47c70');ray.addColorStop(.65,'#ffc43100');ctx.fillStyle=ray;for(let i=0;i<12;i++){ctx.rotate(Math.PI/6);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-45,-H);ctx.lineTo(45,-H);ctx.closePath();ctx.fill();}ctx.restore();}
      if(!reduced){ctx.strokeStyle='#ffe37e';ctx.globalAlpha=Math.max(0,1-t/1.8);ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,40+t*240,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
      ctx.rotate(Math.PI/4);const gold=ctx.createLinearGradient(-55,-55,55,55);gold.addColorStop(0,'#fffbb6');gold.addColorStop(.35,'#e88c00');gold.addColorStop(.6,'#ffec67');gold.addColorStop(1,'#a45900');ctx.fillStyle=gold;ctx.fillRect(-48,-48,96,96);ctx.strokeStyle='#fff4a1';ctx.lineWidth=3;ctx.strokeRect(-43,-43,86,86);ctx.rotate(-Math.PI/4);
      ctx.strokeStyle='#fff49a';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,42,0,Math.PI*2);ctx.stroke();drawGem(ctx,0,0,34,5,false);
      ctx.textAlign='center';ctx.font='bold 37px Georgia';ctx.strokeStyle='#673400';ctx.lineWidth=5;ctx.strokeText('WILD',0,89);ctx.fillStyle='#ffed94';ctx.fillText('WILD',0,89);ctx.font='11px Trebuchet MS';ctx.fillStyle='#fff5cf';ctx.fillText('TABULEIRO LIMPO',0,114);ctx.fillText('+'+format(wild.points)+' PONTOS',0,134);ctx.restore();
    }
    ctx.restore();
  }
  let hudTime=0;
  function frame(now){const dt=Math.min((now-frameTime)/1000||0,1/20);frameTime=now;
    if(wild&&!paused){wild.life-=dt;if(wild.life<=0){wild=null;game.cooldown=0;if(pendingFinish){pendingFinish=false;finish();}}}
    if(game&&!paused&&!wild&&game.status==='playing'){accumulator+=dt;while(accumulator>=1/60){game.step();events();accumulator-=1/60;if(paused||wild)break;}saveTime+=dt;if(saveTime>2){save();saveTime=0;}hudTime+=dt;if(hudTime>.1){updateHUD();hudTime=0;}}
    render(dt);requestAnimationFrame(frame);
  }
  soundButton();home();persist();requestAnimationFrame(frame);
})();

