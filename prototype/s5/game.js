const SYMBOLS=['●','▲','■','◆','★','✚'];
const GRAV=['down','left','up','right'];
const ARROWS={down:'↓',left:'←',up:'↑',right:'→'};
const BOT_LABEL={user:'User',random:'Random bot',greedy:'Greedy bot'};
const rules={line:true,diag:false,remove:true,big:true,after:true};
const state={
	size:7,
	players:3,
	scores:[],
	types:[],
	board:[],
	turn:0,
	gravity:'down',
	over:false,
	token:0,
	log:[],
	lastPlaced:null
};

function emptyBoard(n){
	return Array.from({length:n},()=>Array(n).fill(null));
}
function cloneBoard(b){
	return b.map(row=>row.slice());
}
function key(r,c){
	return r+','+c;
}
function nextGravity(g){
	return GRAV[(GRAV.indexOf(g)+1)%4];
}

function landingOn(board,g,r,c){
	const n=board.length;
	if(g==='down'){
		for(let rr=n-1;rr>=0;rr--) if(board[rr][c]===null) return [rr,c];
	} else if(g==='up'){
		for(let rr=0;rr<n;rr++) if(board[rr][c]===null) return [rr,c];
	} else if(g==='left'){
		for(let cc=0;cc<n;cc++) if(board[r][cc]===null) return [r,cc];
	} else {
		for(let cc=n-1;cc>=0;cc--) if(board[r][cc]===null) return [r,cc];
	}
	return null;
}
function landing(r,c){
	return landingOn(state.board,state.gravity,r,c);
}

function applyGravity(board,g){
	const n=board.length;
	const nb=emptyBoard(n);
	if(g==='down'||g==='up'){
		for(let c=0;c<n;c++){
			const vals=[];
			for(let r=0;r<n;r++) if(board[r][c]!==null) vals.push(board[r][c]);
			if(g==='down') vals.reverse();
			vals.forEach((v,i)=>{
				nb[g==='down'?n-1-i:i][c]=v;
			});
		}
	} else {
		for(let r=0;r<n;r++){
			const vals=[];
			for(let c=0;c<n;c++) if(board[r][c]!==null) vals.push(board[r][c]);
			if(g==='right') vals.reverse();
			vals.forEach((v,i)=>{
				nb[r][g==='right'?n-1-i:i]=v;
			});
		}
	}
	const moved=new Set();
	for(let r=0;r<n;r++) for(let c=0;c<n;c++){
		if(nb[r][c]!==board[r][c]) moved.add(key(r,c));
		board[r][c]=nb[r][c];
	}
	return moved;
}

function detectRuns(board,changed){
	const n=board.length;
	const dirs=[
		{id:'V',dr:1,dc:0,on:rules.line},
		{id:'H',dr:0,dc:1,on:rules.line},
		{id:'D',dr:1,dc:1,on:rules.diag},
		{id:'A',dr:1,dc:-1,on:rules.diag}
	];
	const events=[];
	for(const d of dirs){
		if(!d.on) continue;
		for(let r=0;r<n;r++) for(let c=0;c<n;c++){
			const v=board[r][c];
			if(v===null) continue;
			const pr=r-d.dr,pc=c-d.dc;
			if(pr>=0&&pr<n&&pc>=0&&pc<n&&board[pr][pc]===v) continue;
			const cells=[];
			let rr=r,cc=c;
			while(rr>=0&&rr<n&&cc>=0&&cc<n&&board[rr][cc]===v){
				cells.push([rr,cc]);
				rr+=d.dr;
				cc+=d.dc;
			}
			if(cells.length>=3&&cells.some(cell=>changed.has(key(cell[0],cell[1])))){
				events.push({player:v,dir:d.id,len:cells.length,points:Math.floor(cells.length/3),cells});
			}
		}
	}
	return events;
}

function removeBigGroups(board){
	const n=board.length;
	const seen=Array.from({length:n},()=>Array(n).fill(false));
	const removed=new Set();
	for(let r=0;r<n;r++) for(let c=0;c<n;c++){
		const v=board[r][c];
		if(v===null||seen[r][c]) continue;
		const stack=[[r,c]];
		const comp=[];
		seen[r][c]=true;
		while(stack.length){
			const [a,b]=stack.pop();
			comp.push([a,b]);
			for(const [da,db] of [[1,0],[-1,0],[0,1],[0,-1]]){
				const na=a+da,nb2=b+db;
				if(na<0||na>=n||nb2<0||nb2>=n||seen[na][nb2]) continue;
				if(board[na][nb2]===v){
					seen[na][nb2]=true;
					stack.push([na,nb2]);
				}
			}
		}
		if(comp.length>=4){
			for(const [a,b] of comp){
				board[a][b]=null;
				removed.add(key(a,b));
			}
		}
	}
	return removed;
}

function hasMoves(){
	const n=state.size;
	for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(state.board[r][c]===null) return true;
	return false;
}

function targetsOn(board,g){
	const n=board.length;
	const out=[];
	if(g==='down'||g==='up'){
		for(let c=0;c<n;c++){
			const t=landingOn(board,g,0,c);
			if(t) out.push(t);
		}
	} else {
		for(let r=0;r<n;r++){
			const t=landingOn(board,g,r,0);
			if(t) out.push(t);
		}
	}
	return out;
}

function simResolve(board,changed){
	const events=detectRuns(board,changed);
	const gains=new Array(state.players).fill(0);
	for(const ev of events) gains[ev.player]+=ev.points;
	if(rules.remove){
		for(const ev of events) for(const [r,c] of ev.cells) board[r][c]=null;
	}
	if(rules.big) removeBigGroups(board);
	return gains;
}

function resolveBoard(changed){
	const events=detectRuns(state.board,changed);
	for(const ev of events){
		state.scores[ev.player]+=ev.points;
		log(`${SYMBOLS[ev.player]} Player ${ev.player+1} +${ev.points} (${ev.dir}${ev.len})`);
	}
	if(rules.remove){
		for(const ev of events) for(const [r,c] of ev.cells) state.board[r][c]=null;
	}
	if(rules.big) removeBigGroups(state.board);
	return events;
}

function place(r,c){
	if(state.over) return;
	const t=landing(r,c);
	if(!t) return;
	const p=state.turn;
	state.board[t[0]][t[1]]=p;
	state.lastPlaced=t;
	resolveBoard(new Set([key(t[0],t[1])]));
	state.gravity=nextGravity(state.gravity);
	log(`Gravity ${ARROWS[state.gravity]}`);
	const moved=applyGravity(state.board,state.gravity);
	if(rules.after) resolveBoard(moved);
	if(!hasMoves()) finish();
	else {
		state.turn=(state.turn+1)%state.players;
		maybeBot();
	}
	renderAll();
}

function finish(){
	state.over=true;
	const max=Math.max(...state.scores);
	if(max===0){
		log('Board full — nobody scored');
	} else {
		const winners=[];
		state.scores.forEach((s,i)=>{
			if(s===max) winners.push(`Player ${i+1}`);
		});
		log(`Board full — ${winners.join(' & ')} wins with ${max}`);
	}
}

function maybeBot(){
	if(state.over||state.types[state.turn]==='user') return;
	scheduleBot();
}
function scheduleBot(){
	const token=++state.token;
	setTimeout(()=>{
		if(token===state.token&&!state.over&&state.types[state.turn]!=='user') botMove();
	},420);
}
function botMove(){
	const t=botPick();
	if(t) place(t[0],t[1]);
}
function botPick(){
	const targets=targetsOn(state.board,state.gravity);
	if(!targets.length) return null;
	if(state.types[state.turn]==='random') return targets[Math.floor(Math.random()*targets.length)];
	return greedyPick(targets);
}
function greedyPick(targets){
	const me=state.turn;
	let best=null,bestVal=-Infinity;
	for(const t of targets){
		const b=cloneBoard(state.board);
		b[t[0]][t[1]]=me;
		const gains=simResolve(b,new Set([key(t[0],t[1])]));
		const g1=nextGravity(state.gravity);
		const moved=applyGravity(b,g1);
		if(rules.after){
			const post=simResolve(b,moved);
			for(let i=0;i<gains.length;i++) gains[i]+=post[i];
		}
		let oppMax=0;
		for(let o=0;o<state.players;o++){
			if(o===me) continue;
			for(const ot of targetsOn(b,g1)){
				const b2=cloneBoard(b);
				b2[ot[0]][ot[1]]=o;
				const g2=simResolve(b2,new Set([key(ot[0],ot[1])]));
				if(g2[o]>oppMax) oppMax=g2[o];
			}
		}
		const val=gains[me]-0.4*oppMax+Math.random()*0.06;
		if(val>bestVal){
			bestVal=val;
			best=t;
		}
	}
	return best;
}

function log(str){
	state.log.push(str);
	if(state.log.length>60) state.log.shift();
}
function renderLog(){
	const el=document.getElementById('log');
	el.innerHTML='';
	state.log.slice(-7).reverse().forEach(line=>{
		const d=document.createElement('div');
		d.textContent=line;
		el.appendChild(d);
	});
}
function cellSize(n){
	return Math.max(28,Math.min(56,Math.floor(520/n)-6));
}
function renderBoard(){
	const el=document.getElementById('board');
	const n=state.size;
	el.style.setProperty('--n',n);
	el.style.setProperty('--cell',cellSize(n)+'px');
	let cls='board grav-'+state.gravity;
	if(state.over||state.types[state.turn]!=='user') cls+=' locked';
	if(state.over) cls+=' over';
	el.className=cls;
	el.innerHTML='';
	for(let r=0;r<n;r++) for(let c=0;c<n;c++){
		const b=document.createElement('button');
		b.type='button';
		b.className='cell';
		b.dataset.r=r;
		b.dataset.c=c;
		const v=state.board[r][c];
		if(v!==null){
			b.classList.add('p'+v);
			b.textContent=SYMBOLS[v];
		}
		if(state.lastPlaced&&state.lastPlaced[0]===r&&state.lastPlaced[1]===c) b.classList.add('pop');
		el.appendChild(b);
	}
}
function renderArrows(){
	for(const g of GRAV){
		const el=document.getElementById('ar'+g[0].toUpperCase()+g.slice(1));
		el.classList.toggle('active',state.gravity===g);
	}
	document.getElementById('gravArrow').textContent=ARROWS[state.gravity];
}
function renderPlayers(){
	const el=document.getElementById('players');
	el.innerHTML='';
	for(let i=0;i<state.players;i++){
		const row=document.createElement('div');
		row.className='player'+(i===state.turn&&!state.over?' active-turn':'');
		const sw=document.createElement('span');
		sw.className='swatch p'+i;
		sw.textContent=SYMBOLS[i];
		const info=document.createElement('div');
		const nm=document.createElement('div');
		nm.className='pname';
		nm.textContent='Player '+(i+1);
		const sc=document.createElement('div');
		sc.className='pscore';
		sc.textContent='Score '+state.scores[i];
		info.append(nm,sc);
		const sel=document.createElement('select');
		for(const k of Object.keys(BOT_LABEL)){
			const o=document.createElement('option');
			o.value=k;
			o.textContent=BOT_LABEL[k];
			if(state.types[i]===k) o.selected=true;
			sel.appendChild(o);
		}
		sel.addEventListener('change',()=>{
			state.types[i]=sel.value;
			if(i===state.turn&&sel.value!=='user') scheduleBot();
			else if(i===state.turn) state.token++;
			renderAll();
		});
		row.append(sw,info,sel);
		el.appendChild(row);
	}
}
function renderStatus(){
	const el=document.getElementById('status');
	if(state.over){
		el.textContent='Board full — game over, see scores above';
	} else {
		el.textContent=`Turn: Player ${state.turn+1} · ${BOT_LABEL[state.types[state.turn]]}`;
	}
}
function renderAll(){
	renderBoard();
	renderArrows();
	renderPlayers();
	renderStatus();
	renderLog();
}

let ghostCell=null;
function setGhost(t){
	const el=document.querySelector(`.cell[data-r="${t[0]}"][data-c="${t[1]}"]`);
	if(!el) return;
	ghostCell=el;
	el.classList.add('ghost','p'+state.turn);
	el.textContent=SYMBOLS[state.turn];
}
function clearGhost(){
	if(!ghostCell) return;
	ghostCell.classList.remove('ghost');
	for(let i=0;i<SYMBOLS.length;i++) ghostCell.classList.remove('p'+i);
	const rr=+ghostCell.dataset.r,cc=+ghostCell.dataset.c;
	ghostCell.textContent='';
	const v=state.board[rr][cc];
	if(v!==null){
		ghostCell.classList.add('p'+v);
		ghostCell.textContent=SYMBOLS[v];
	}
	ghostCell=null;
}

function bindCheckbox(id,field){
	const el=document.getElementById(id);
	el.checked=rules[field];
	el.addEventListener('change',()=>{
		rules[field]=el.checked;
	});
}
function setPlayers(v){
	state.players=v;
	for(let i=0;i<v;i++){
		if(state.scores[i]===undefined){
			state.scores[i]=0;
			state.types[i]='user';
		}
	}
	state.scores.length=v;
	state.types.length=v;
	if(state.turn>=v) state.turn=v-1;
	log(`Players set to ${v}`);
	maybeBot();
}
function resizeBoard(nn){
	const n=state.size;
	if(nn===n) return;
	const old=state.board;
	const nb=emptyBoard(nn);
	const off=nn-n;
	for(let r=0;r<n;r++){
		const nr=r+off;
		if(nr<0) continue;
		for(let c=0;c<n;c++) if(c<nn) nb[nr][c]=old[r][c];
	}
	state.board=nb;
	state.size=nn;
	state.over=!hasMoves();
	log(`Board resized to ${nn}×${nn}`);
	if(!state.over) maybeBot();
}
function cleanBoard(){
	state.token++;
	state.board=emptyBoard(state.size);
	for(let i=0;i<state.players;i++) state.scores[i]=0;
	state.turn=0;
	state.gravity='down';
	state.over=false;
	state.lastPlaced=null;
	state.log=[];
	log('Board cleaned');
	renderAll();
}

function init(){
	const bs=document.getElementById('boardSize');
	for(let n=3;n<=10;n++){
		const o=document.createElement('option');
		o.value=n;
		o.textContent=n+' × '+n;
		if(n===state.size) o.selected=true;
		bs.appendChild(o);
	}
	const pc=document.getElementById('playerCount');
	for(let p=1;p<=6;p++){
		const o=document.createElement('option');
		o.value=p;
		o.textContent=p;
		if(p===state.players) o.selected=true;
		pc.appendChild(o);
	}
	state.scores=[0,0,0];
	state.types=['user','user','user'];
	state.board=emptyBoard(state.size);
	bindCheckbox('rLine','line');
	bindCheckbox('rDiag','diag');
	bindCheckbox('rRemove','remove');
	bindCheckbox('rBig','big');
	bindCheckbox('rAfter','after');
	bs.addEventListener('change',e=>{
		resizeBoard(+e.target.value);
		renderAll();
	});
	pc.addEventListener('change',e=>{
		setPlayers(+e.target.value);
		renderAll();
	});
	document.getElementById('clean').addEventListener('click',cleanBoard);
	const boardEl=document.getElementById('board');
	boardEl.addEventListener('click',e=>{
		const cell=e.target.closest('.cell');
		if(!cell||state.over||state.types[state.turn]!=='user') return;
		place(+cell.dataset.r,+cell.dataset.c);
	});
	boardEl.addEventListener('mouseover',e=>{
		if(state.over||state.types[state.turn]!=='user') return;
		const cell=e.target.closest('.cell');
		if(!cell) return;
		clearGhost();
		const t=landing(+cell.dataset.r,+cell.dataset.c);
		if(t) setGhost(t);
	});
	boardEl.addEventListener('mouseleave',clearGhost);
	renderAll();
}

if(typeof module!=='undefined'&&module.exports){
	module.exports={
		state,rules,SYMBOLS,ARROWS,GRAV,
		emptyBoard,cloneBoard,key,nextGravity,landingOn,applyGravity,detectRuns,
		removeBigGroups,hasMoves,targetsOn,simResolve,botPick,greedyPick
	};
}
if(typeof document!=='undefined') init();
