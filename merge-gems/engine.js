/* Deterministic 60 Hz simulation, shared by the browser and the Node tests. */
(function (root) {
  'use strict';
  const W = 360, H = 520, LIMIT = 75;
  const GEMS = [
    ['Rubi','#ff3525','#750400',16,8],['Coral','#ff8200','#953300',21,8],
    ['Âmbar','#ffca08','#955000',27,8],['Safira','#164dff','#040c83',34,4],
    ['Esmeralda','#39f400','#075500',42,8],['Ametista','#aa17ff','#360080',51,5],
    ['Cristal','#00efd7','#00564c',61,3],['Aurora','#fa09d6','#7e006c',72,8],
    ['Zênite','#ffe832','#ad6200',84,10],['Lendária','#edffdc','#4aae14',98,12]
  ].map(([name,hi,lo,r,sides])=>[name,hi,lo,r*.85*.5*1.2,sides]);
  const SHAPES=GEMS.map(([, , ,r,sides])=>{
    const vertices=Array.from({length:sides},(_,i)=>{const angle=-Math.PI/2+(sides===8?Math.PI/8:0)+i*Math.PI*2/sides;return{x:Math.cos(angle)*r,y:Math.sin(angle)*r};});
    const axes=vertices.map((p,i)=>{const q=vertices[(i+1)%sides],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);return{x:-dy/len,y:dx/len};});
    return{vertices,axes,left:-Math.min(...vertices.map(p=>p.x)),right:Math.max(...vertices.map(p=>p.x)),top:-Math.min(...vertices.map(p=>p.y)),bottom:Math.max(...vertices.map(p=>p.y))};
  });
  // SAT uses the same polygon vertices as the artwork, including flat bottoms.
  function contact(a,b){
    if((a.x-b.x)**2+(a.y-b.y)**2>(a.r+b.r+.15)**2)return null;
    const sa=SHAPES[a.level-1],sb=SHAPES[b.level-1];let depth=Infinity,nx=0,ny=0;
    for(const axis of [...sa.axes,...sb.axes]){
      let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
      for(const p of sa.vertices){const v=(p.x+a.x)*axis.x+(p.y+a.y)*axis.y;amin=Math.min(amin,v);amax=Math.max(amax,v);}
      for(const p of sb.vertices){const v=(p.x+b.x)*axis.x+(p.y+b.y)*axis.y;bmin=Math.min(bmin,v);bmax=Math.max(bmax,v);}
      const forward=amax-bmin,back=bmax-amin;if(forward<-.15||back<-.15)return null;
      const d=Math.min(forward,back);if(d<depth){depth=d;const sign=forward<back?1:-1;nx=axis.x*sign;ny=axis.y*sign;}
    }
    return{nx,ny,depth:Math.max(0,depth)};
  }
  const STAGES = [
    ['O despertar',1200],['Luz de âmbar',2600],['Lago de safira',4200],
    ['Jardim secreto',6500],['O eco violeta',9500],['Gruta de cristal',13500],
    ['Primeira aurora',19000],['Rumo ao zênite',26000],['O cofre dourado',35000],['A última câmara',48000]
  ];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  class Game {
    constructor(mode='campaign',stage=0,random=Math.random) {
      this.mode=mode;this.stage=clamp(stage,0,9);this.random=random;
      this.gems=[];this.score=0;this.time=0;this.nextId=1;this.status='playing';this.height=H;
      this.current=1;this.next=this.roll();this.cooldown=0;this.danger=0;
      this.combo=0;this.comboUntil=0;this.maxCombo=1;this.merges=0;this.highest=1;
      this.powers={hammer:2,shuffle:1,upgrade:1};this.used=0;this.dragId=null;this.events=[];
    }
    roll(){const n=this.random();return n<.62?1:n<.91?2:3;}
    resizeHeight(height){const next=clamp(height,260,1800),delta=next-this.height;if(!delta)return;for(const g of this.gems){const s=SHAPES[g.level-1];g.y=clamp(g.y+delta,s.top,next-s.bottom);}this.height=next;}
    add(x,y,level){const r=GEMS[level-1][3],s=SHAPES[level-1];const g={id:this.nextId++,x:clamp(x,s.left,W-s.right),y:clamp(y,s.top,this.height-s.bottom),level,r,vx:0,vy:0,age:0};this.gems.push(g);return g;}
    drop(x){if(this.status!=='playing'||this.cooldown>0||this.dragId!==null)return false;this.add(x,36,this.current);this.current=this.next;this.next=this.roll();this.cooldown=.36;this.events.push({type:'drop'});return true;}
    hit(x,y){
      const ordered=[...this.gems].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
      return ordered.find(g=>{const v=SHAPES[g.level-1].vertices;return v.every((p,i)=>{const q=v[(i+1)%v.length];return(q.x-p.x)*(y-g.y-p.y)-(q.y-p.y)*(x-g.x-p.x)>=0;});})||ordered.find(g=>Math.hypot(x-g.x,y-g.y)<=22);
    }
    startDrag(x,y){if(this.status!=='playing')return null;const g=this.hit(x,y);if(g){this.dragId=g.id;g.vx=g.vy=0;}return g;}
    moveDrag(x,y){const g=this.gems.find(g=>g.id===this.dragId);if(g){const s=SHAPES[g.level-1];g.x=clamp(x,s.left,W-s.right);g.y=clamp(y,s.top,this.height-s.bottom);g.vx=g.vy=0;}}
    endDrag(vx=0,vy=0){const g=this.gems.find(g=>g.id===this.dragId);if(g){g.vx=clamp(vx,-240,240);g.vy=clamp(vy,-240,240);}this.dragId=null;}
    power(kind,id){
      if(this.status!=='playing'||!this.powers[kind])return false;
      if(kind==='shuffle'){
        if(!this.gems.length)return false;
        for(const g of this.gems){g.vx=(this.random()-.5)*500;g.vy=-140-this.random()*120;}
      }else{
        const g=this.gems.find(g=>g.id===id);if(!g||kind==='upgrade'&&g.level===10)return false;
        if(kind==='hammer'){this.gems=this.gems.filter(a=>a!==g);this.events.push({type:'burst',x:g.x,y:g.y,level:g.level});}
        else if(kind==='upgrade'){g.level++;g.r=GEMS[g.level-1][3];g.x=clamp(g.x,g.r,W-g.r);g.y=clamp(g.y,g.r,this.height-g.r);g.age=0;this.highest=Math.max(this.highest,g.level);this.events.push({type:'discover',level:g.level});}
        else return false;
      }
      this.powers[kind]--;this.used++;this.danger=0;this.endDrag();this.events.push({type:'power'});return true;
    }
    mergePair(a,b){
      const x=(a.x+b.x)/2,y=(a.y+b.y)/2,level=Math.min(10,a.level+1);
      const cleared=a.level===10?this.gems.map(g=>({x:g.x,y:g.y,level:g.level})):null;
      this.gems=this.gems.filter(g=>g!==a&&g!==b);
      if(this.dragId===a.id||this.dragId===b.id)this.endDrag();
      if(a.level<10){const g=this.add(x,y,level);g.vy=-95;}
      this.combo=this.time<=this.comboUntil?this.combo+1:1;this.comboUntil=this.time+2.2;
      const multiplier=Math.min(5,this.combo);this.maxCombo=Math.max(this.maxCombo,multiplier);
      const points=(a.level===10?15000:level*100)*multiplier;
      this.score+=points;this.merges++;this.highest=Math.max(this.highest,level);
      this.events.push({type:'merge',x,y,level,points,multiplier,legendary:a.level===10});
      if(cleared){
        this.gems=[];this.endDrag();this.danger=0;this.cooldown=1.8;
        this.events.push({type:'wild',x,y,points,cleared});
      }
    }
    step(dt=1/60){
      if(this.status!=='playing')return;
      dt=clamp(dt,0,1/30);this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
      for(const g of this.gems){g.age+=dt;if(g.id===this.dragId)continue;g.vy+=650*dt;g.vx*=Math.pow(.986,dt*60);g.x+=g.vx*dt;g.y+=g.vy*dt;}
      // Several position solver passes keep piles stable at fixed simulation speed.
      for(let pass=0;pass<6;pass++){
        let merged=false;
        outer:for(let i=0;i<this.gems.length;i++)for(let j=i+1;j<this.gems.length;j++){
          const a=this.gems[i],b=this.gems[j],collision=contact(a,b);
          if(!collision)continue;
          if(a.level===b.level){this.mergePair(a,b);merged=true;break outer;}
          const {nx,ny}=collision;
          const wa=a.id===this.dragId?0:1/(a.r*a.r),wb=b.id===this.dragId?0:1/(b.r*b.r),total=wa+wb;
          if(!total)continue;
          const overlap=collision.depth;
          a.x-=nx*overlap*wa/total;a.y-=ny*overlap*wa/total;b.x+=nx*overlap*wb/total;b.y+=ny*overlap*wb/total;
          const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
          if(speed<0){const bounce=speed<-65?.24:0;const impulse=-(1+bounce)*speed/total;a.vx-=impulse*nx*wa;a.vy-=impulse*ny*wa;b.vx+=impulse*nx*wb;b.vy+=impulse*ny*wb;}
        }
        for(const g of this.gems){
          const shape=SHAPES[g.level-1];
          if(g.x<shape.left){g.x=shape.left;g.vx=Math.abs(g.vx)*.2;}if(g.x>W-shape.right){g.x=W-shape.right;g.vx=-Math.abs(g.vx)*.2;}
          if(g.y>this.height-shape.bottom){if(g.vy>160)this.events.push({type:'land',level:g.level});g.y=this.height-shape.bottom;g.vy=g.vy>70?-g.vy*.28:Math.min(0,g.vy);g.vx*=.96;}
        }
        if(merged&&this.mode==='campaign'&&this.score>=STAGES[this.stage][1])break;
      }
      const inDanger=this.gems.some(g=>g.id!==this.dragId&&g.age>1.8&&g.y-SHAPES[g.level-1].top<LIMIT);
      this.danger=inDanger?this.danger+dt:Math.max(0,this.danger-dt*2);
      if(this.mode==='campaign'&&this.score>=STAGES[this.stage][1]){this.status='won';this.endDrag();this.events.push({type:'won'});}
      else if(this.danger>=3){this.status='lost';this.endDrag();this.events.push({type:'lost'});}
    }
    snapshot(){const {random,events,dragId,...data}=this;return {...data,version:1,dragId:null};}
    static restore(data,random=Math.random){
      if(!data||data.version!==1||!['campaign','endless'].includes(data.mode)||!Number.isInteger(data.stage)||data.stage<0||data.stage>9||data.status!=='playing'||!Array.isArray(data.gems)||data.gems.length>300)throw Error('Invalid save');
      const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
      for(const k of ['score','time','nextId','cooldown','danger','combo','comboUntil','maxCombo','merges','highest','used'])if(!finite(data[k]))throw Error('Invalid saved value');
      for(const k of ['current','next'])if(!Number.isInteger(data[k])||data[k]<1||data[k]>3)throw Error('Invalid queue');
      if(!data.powers||!['hammer','shuffle','upgrade'].every(k=>Number.isInteger(data.powers[k])&&data.powers[k]>=0&&data.powers[k]<=2))throw Error('Invalid powers');
      const ids=new Set();
      for(const g of data.gems){if(!Number.isInteger(g.level)||g.level<1||g.level>10||!Number.isInteger(g.id)||g.id<1||ids.has(g.id)||!['x','y','vx','vy','age'].every(k=>Number.isFinite(g[k])))throw Error('Invalid gem');ids.add(g.id);}
      const game=new Game(data.mode,data.stage,random);
      if(data.height!==undefined&&(!finite(data.height)||data.height<260||data.height>1800))throw Error('Invalid board height');
      game.height=data.height??H;
      for(const k of ['score','time','cooldown','danger','combo','comboUntil','maxCombo','merges','highest','used','current','next'])game[k]=data[k];
      game.powers={...data.powers};game.gems=data.gems.map(g=>({...g,r:GEMS[g.level-1][3]}));game.nextId=Math.max(data.nextId,...game.gems.map(g=>g.id+1),1);return game;
    }
  }
  const api={Game,GEMS,SHAPES,contact,STAGES,W,H,LIMIT,clamp};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MergeGems=api;
})(typeof globalThis!=='undefined'?globalThis:this);

