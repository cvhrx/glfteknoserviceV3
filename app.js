// app.js with two fixes: day picker loads saved data, export PDF includes -1 client when single client

const $ = s => document.querySelector(s);
const pad2 = n => String(n).padStart(2,'0');
const fmtIT = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

const state = { user:null, company:{}, clients:[], tariffs:{ord:12,str:25,km:0.4,trasf:50,pern:80} };

const auth = firebase.auth();
const db   = firebase.firestore();

auth.onAuthStateChanged(async (u)=>{
  if(u){
    state.user = u;
    $('#authCard').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initApp();
  }else{
    $('#authCard').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnShowRegister').onclick = ()=> $('#registerBox').classList.toggle('hidden');
  $('#btnCancelRegister').onclick = ()=> $('#registerBox').classList.add('hidden');

  $('#btnLogin').onclick = async ()=>{
    try{
      const email=$('#loginEmail').value.trim(); const pass=$('#loginPass').value;
      if(!email||!pass){ alert('Inserisci email e password'); return; }
      await auth.signInWithEmailAndPassword(email, pass);
    }catch(e){ console.error('LOGIN ERROR', e); alert(e.message||e.code); }
  };
  $('#btnDoRegister').onclick = async ()=>{
    try{
      const email=$('#regEmail').value.trim(); const pass=$('#regPass').value;
      if(!email||!pass){ alert('Email e password richieste'); return; }
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await db.collection('users').doc(cred.user.uid).set({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        company: {
          ragione: $('#regRagione').value || '',
          piva: $('#regPiva').value || '',
          indirizzo: $('#regIndirizzo').value || '',
          telefono: $('#regTelefono').value || '',
          email: $('#regEmailAzi').value || '',
          sdi: $('#regSdi').value || ''
        },
        tariffs: state.tariffs
      }, { merge: true });
      alert('Registrazione completata');
      $('#registerBox').classList.add('hidden');
    }catch(e){ console.error('REG ERROR', e); alert(e.message||e.code); }
  };

  $('#chipTrasf').onclick = ()=> $('#chipTrasf').classList.toggle('active');
  $('#chipPern').onclick  = ()=> $('#chipPern').classList.toggle('active');
  $('#btnSettings').onclick = ()=> $('#settingsDlg').showModal();
  $('#closeSettings').onclick = ()=> $('#settingsDlg').close();
  $('#tabTar').onclick = ()=> togglePane('Tar');
  $('#tabCli').onclick = ()=> togglePane('Cli');
  $('#btnSaveTar').onclick = saveTariffs;
  $('#btnAddCli').onclick = addClient;
  $('#btnDelCli').onclick = delClient;
  $('#btnSaveCli').onclick = saveClients;
  $('#btnSaveDay').onclick = saveDay;
  $('#btnExportPdf').onclick = exportPdf;
  $('#tabList').onclick = ()=> switchView('list');
  $('#tabCal').onclick  = ()=> switchView('cal');
  $('#closeDayDlg').onclick = ()=> $('#dayDlg').close();
});

function togglePane(which){
  const tar = which==='Tar';
  $('#paneTariffe').classList.toggle('hidden', !tar);
  $('#paneClienti').classList.toggle('hidden', tar);
  $('#tabTar').classList.toggle('active', tar);
  $('#tabCli').classList.toggle('active', !tar);
}

function switchView(which){
  if(which==='cal'){
    const dp = $('#dayPicker');
    if(dp && dp.value) loadMonth(dp.value.slice(0,7));
    $('#tabCal').classList.add('active'); $('#tabList').classList.remove('active');
    $('#calView').classList.remove('hidden'); $('#listView').classList.add('hidden');
  }else{
    $('#tabList').classList.add('active'); $('#tabCal').classList.remove('active');
    $('#listView').classList.remove('hidden'); $('#calView').classList.add('hidden');
  }
}

function buildTimeSelectors(){
  const hours = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
  const mins  = ['00','30']; // 0 e 30
  [['#in1h','#in1m'],['#out1h','#out1m'],['#in2h','#in2m'],['#out2h','#out2m']].forEach(([hSel,mSel])=>{
    document.querySelector(hSel).innerHTML =
      '<option value="" disabled selected>ore</option>' +
      hours.map(h=>`<option>${h}</option>`).join('');
    document.querySelector(mSel).innerHTML =
      '<option value="" disabled selected>minuti</option>' +
      mins.map(m=>`<option>${m}</option>`).join('');
  });
}

function timeDiff(a,b){
  if(!a||!b) return 0;
  const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number);
  const d=((bh*60+bm)-(ah*60+am))/60;
  return Math.max(0, d);
}

function getPayload(){
  const h=(sel)=> (document.querySelector(sel).value || '00');
  const mk = (hh,mm)=> (hh+':'+mm);
  const in1 = mk(h('#in1h'),h('#in1m'));
  const out1= mk(h('#out1h'),h('#out1m'));
  const in2 = mk(h('#in2h'),h('#in2m'));
  const out2= mk(h('#out2h'),h('#out2m'));
  const seg1 = timeDiff(in1,out1);
  const seg2 = timeDiff(in2,out2);
  const total = (seg1+seg2);
  const ord = Math.min(8, total);
  const str = Math.max(0, total-8);

  let clientIndex = -1;
  if(state.clients.length >= 2){
    clientIndex = Math.max(-1, (document.getElementById('clientSelect').selectedIndex||0) - 1);
  }else if(state.clients.length === 1){
    clientIndex = 0; // unico cliente auto-assegnato
  }

  return {
    in1, out1, in2, out2,
    ordH: Number(ord.toFixed(2)),
    strH: Number(str.toFixed(2)),
    totalH: Number(total.toFixed(2)),
    km: parseFloat(document.getElementById('km').value||'0')||0,
    trasf: document.getElementById('chipTrasf').classList.contains('active'),
    pern:  document.getElementById('chipPern').classList.contains('active'),
    note: document.getElementById('note').value||'',
    clientIndex
  };
}

async function initApp(){
  buildTimeSelectors();
  await loadClientsAndTariffs();

  const dp = document.getElementById('dayPicker');
  const today = new Date().toISOString().slice(0,10);
  dp.value = dp.value || today;
  dp.addEventListener('change', e=>{
    const iso = e.target.value;
    loadDay(iso);               // carica i dati nel form
    loadMonth(iso.slice(0,7));  // aggiorna elenco e calendario
  });

  await loadDay(dp.value);
  await loadMonth(dp.value.slice(0,7));
}

async function loadClientsAndTariffs(){
  const uref = db.collection('users').doc(state.user.uid);
  const ut = await uref.get();
  if(ut.exists){
    const data = ut.data();
    state.tariffs = data.tariffs || state.tariffs;
    state.company = data.company || {};
    document.getElementById('tarOrd').value = state.tariffs.ord;
    document.getElementById('tarStr').value = state.tariffs.str;
    document.getElementById('tarKm').value  = state.tariffs.km;
    document.getElementById('tarTrasf').value = state.tariffs.trasf;
    document.getElementById('tarPern').value  = state.tariffs.pern;
  }
  const cs = await uref.collection('clients').get();
  state.clients = cs.docs.map(d=>({id:d.id, ...d.data()}));
  renderClients();
}

function renderClients(){
  const sel  = document.getElementById('clientSelect');
  const sel2 = document.getElementById('cliSelect');
  const opts = (state.clients||[]).map((c,i)=>'<option value="'+i+'">'+(c.ragione||('Cliente '+(i+1)))+'</option>').join('');

  if(sel){
    sel.innerHTML = '<option>—</option>'+opts;
    const field = sel.closest('.field');
    if(field) field.style.display = (state.clients.length > 1 ? '' : 'none');
  }
  if(sel2) sel2.innerHTML = opts;
}

function addClient(){
  state.clients.push({
    ragione: document.getElementById('cliRagione').value || '',
    piva: document.getElementById('cliPiva').value || '',
    email: document.getElementById('cliEmail').value || '',
    tel: document.getElementById('cliTel').value || '',
    indirizzo: document.getElementById('cliIndirizzo').value || '',
    sdi: document.getElementById('cliSdi').value || ''
  });
  renderClients();
  alert('Salvataggio effettuato');
}
function delClient(){
  const i = document.getElementById('cliSelect').selectedIndex;
  if(i>=0){ state.clients.splice(i,1); renderClients(); }
}
async function saveClients(){
  const col = db.collection('users').doc(state.user.uid).collection('clients');
  const snap = await col.get();
  const batch = db.batch();
  snap.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  const b2 = db.batch();
  state.clients.forEach(c=> b2.set(col.doc(), c));
  await b2.commit();
  alert('Clienti salvati');
}

function setTime(hSel,mSel,hhmm){
  const [h,m] = (hhmm||'00:00').split(':');
  const H = document.querySelector(hSel), M = document.querySelector(mSel);
  if(H) H.value = h || '';
  if(M) M.value = m || '';
}

async function saveDay(){
  const d = document.getElementById('dayPicker').value;
  const data = getPayload();
  try{
    await db.collection('users').doc(state.user.uid).collection('days').doc(d).set(data, {merge:true});
    await loadMonth(d.slice(0,7));
    alert('Giornata salvata');
  }catch(e){
    console.error('SAVE DAY ERROR', e);
    alert('Errore salvataggio: ' + (e.message || e.code));
  }
}

async function loadDay(d){
  const ref = db.collection('users').doc(state.user.uid).collection('days').doc(d);
  const snap = await ref.get();
  if(snap.exists){
    const v = snap.data();
    setTime('#in1h','#in1m', v.in1||'00:00');
    setTime('#out1h','#out1m', v.out1||'00:00');
    setTime('#in2h','#in2m', v.in2||'00:00');
    setTime('#out2h','#out2m', v.out2||'00:00');
    document.getElementById('km').value = v.km||0;
    document.getElementById('note').value = v.note||'';
    document.getElementById('chipTrasf').classList.toggle('active', !!v.trasf);
    document.getElementById('chipPern').classList.toggle('active', !!v.pern);
    const idx = (v.clientIndex==null?-1:v.clientIndex);
    document.getElementById('clientSelect').selectedIndex = (idx<0? -1: idx) + 1;
  }else{
    document.getElementById('km').value=0; document.getElementById('note').value='';
    document.getElementById('chipTrasf').classList.remove('active');
    document.getElementById('chipPern').classList.remove('active');
    document.getElementById('clientSelect').selectedIndex = 0;
  }
}

async function loadMonth(yyyyMM){
  const [y,m] = yyyyMM.split('-').map(Number);
  const label = new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));
  const ml = document.getElementById('monthLabel'); if(ml) ml.textContent = label;

  const list = document.getElementById('listView'); const grid = document.getElementById('calGrid');
  if(list) list.innerHTML=''; if(grid) grid.innerHTML='';
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysMap = {};
  for(let d=1; d<=daysInMonth; d++){
    const id = `${y}-${pad2(m)}-${pad2(d)}`;
    daysMap[id] = { id, in1:'', out1:'', in2:'', out2:'', ordH:0, strH:0, totalH:0, km:0, note:'', trasf:false, pern:false, clientIndex:-1 };
  }
  try{
    const snap = await db.collection('users').doc(state.user.uid).collection('days')
      .where(firebase.firestore.FieldPath.documentId(), '>=', `${yyyyMM}-01`)
      .where(firebase.firestore.FieldPath.documentId(), '<=', `${yyyyMM}-${pad2(daysInMonth)}`)
      .get();
    snap.forEach(doc=>{ daysMap[doc.id] = Object.assign(daysMap[doc.id], doc.data()); });
  }catch(e){
    console.error('LOAD MONTH ERROR', e);
    alert('Errore lettura mese: ' + (e.message||e.code));
  }
  const arr = Object.values(daysMap).sort((a,b)=>a.id.localeCompare(b.id));

  if(list){
    arr.forEach(v=>{
      const cli = (state.clients||[])[v.clientIndex]?.ragione || '—';
      const row = document.createElement('div');
      row.className='list-item';
      const compiled = (v.totalH>0) || v.in1 || v.out1 || v.in2 || v.out2;
      if(compiled) row.classList.add('compiled');
      row.innerHTML = `<div><strong>${fmtIT(v.id)}</strong> · ${cli}</div>
        <div><span class="badge ok">${(v.ordH||0).toFixed(1)}h</span> <span class="badge warn">${(v.strH||0).toFixed(1)}h</span></div>`;
      row.onclick = ()=>{
        const exp = document.createElement('div');
        exp.className='card';
        exp.innerHTML = `<p>In1: ${v.in1||'-'} Out1: ${v.out1||'-'} · In2: ${v.in2||'-'} Out2: ${v.out2||'-'} · KM: ${v.km||0}</p>
                         <p>Trasferta: ${v.trasf?'Sì':'No'} · Pernotto: ${v.pern?'Sì':'No'}</p>
                         <p>Note: ${v.note||''}</p>`;
        if(row.nextSibling && row.nextSibling.className==='card') row.parentNode.removeChild(row.nextSibling);
        else row.parentNode.insertBefore(exp, row.nextSibling);
      };
      list.appendChild(row);
    });
  }

  if(grid){
    const firstDay = new Date(y, m-1, 1);
    const offset = (firstDay.getDay()+6)%7;
    for(let i=0;i<offset;i++){ const empty=document.createElement('div'); empty.className='day'; grid.appendChild(empty); }
    arr.forEach(v=>{
      const dNum = Number(v.id.slice(-2));
      const cell=document.createElement('div'); cell.className='day'; cell.dataset.date=v.id;
      const compiled = (v.totalH>0) || v.in1 || v.out1 || v.in2 || v.out2; if(compiled) cell.classList.add('compiled');
      cell.innerHTML = `<strong>${dNum}</strong><div class="bar"></div>
        <div><span class="badge ok">${(v.ordH||0).toFixed(1)}h</span> <span class="badge warn">${(v.strH||0).toFixed(1)}h</span></div>`;
      const bar = cell.querySelector('.bar');
      const s1=document.createElement('span'); s1.className='seg ord'; s1.style.width=Math.min(100,Math.round((v.ordH||0)/8*100))+'%';
      const s2=document.createElement('span'); s2.className='seg str'; s2.style.width=Math.min(100,Math.round((v.strH||0)/8*100))+'%';
      bar.appendChild(s1); bar.appendChild(s2);
      cell.onclick = ()=> showDayDetail(v);
      grid.appendChild(cell);
    });
  }
}

function showDayDetail(v){
  const cli = (state.clients||[])[v.clientIndex]?.ragione || '—';
  document.getElementById('dayDetail').innerHTML = `<p><strong>${fmtIT(v.id)}</strong></p>
    <p>Cliente: ${cli}</p>
    <p>In1: ${v.in1||'-'}  Out1: ${v.out1||'-'}<br>In2: ${v.in2||'-'}  Out2: ${v.out2||'-'}</p>
    <p>Ord: ${(v.ordH||0).toFixed(2)}h  Str: ${(v.strH||0).toFixed(2)}h  KM: ${v.km||0}</p>
    <p>Trasferta: ${v.trasf?'Sì':'No'}  Pernotto: ${v.pern?'Sì':'No'}</p>
    <p>Note: ${v.note||''}</p>`;
  document.getElementById('dayDlg').showModal();
}

async function saveTariffs(){
  state.tariffs = {
    ord: parseFloat(document.getElementById('tarOrd').value||'12')||12,
    str: parseFloat(document.getElementById('tarStr').value||'25')||25,
    km: parseFloat(document.getElementById('tarKm').value||'0.4')||0.4,
    trasf: parseFloat(document.getElementById('tarTrasf').value||'50')||50,
    pern: parseFloat(document.getElementById('tarPern').value||'80')||80
  };
  await db.collection('users').doc(state.user.uid).set({tariffs: state.tariffs}, {merge:true});
  alert('Tariffe salvate');
}

async function imgToDataURL(url){
  const r = await fetch(url);
  const b = await r.blob();
  return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
}

async function exportPdf(){ 
  let clientIndex = -1;
  try{
    if((state.clients||[]).length > 1){
      const names = state.clients.map((c,i)=> i + ': ' + (c.ragione || ('Cliente ' + (i+1))) ).join('\\n');
      const ans = prompt('Esporta PDF per:\\n- Tutti = -1\\n' + names + '\\nInserisci indice o -1:', '-1');
      clientIndex = parseInt(ans||'-1',10); if(isNaN(clientIndex)) clientIndex = -1;
    }else if((state.clients||[]).length === 1){ clientIndex = 0; }
  }catch(_){ clientIndex = -1; }

  const yyyyMM = (document.getElementById('dayPicker').value || new Date().toISOString().slice(0,10)).slice(0,7);
  const [y,m] = yyyyMM.split('-').map(Number);
  const last = new Date(y,m,0).getDate();

  const map = {};
  for(let d=1; d<=last; d++){
    const id = `${yyyyMM}-${pad2(d)}`;
    map[id] = { id, in1:'', out1:'', in2:'', out2:'', ordH:0, strH:0, totalH:0, km:0, note:'', trasf:false, pern:false, clientIndex:-1 };
  }
  try{
    const snap = await db.collection('users').doc(state.user.uid).collection('days')
      .where(firebase.firestore.FieldPath.documentId(), '>=', `${yyyyMM}-01`)
      .where(firebase.firestore.FieldPath.documentId(), '<=', `${yyyyMM}-${pad2(last)}`)
      .get();
    snap.forEach(d=>{ map[d.id] = Object.assign(map[d.id], d.data()); });
  }catch(e){
    console.error('PDF LOAD ERROR', e);
    alert('Errore lettura dati per PDF: ' + (e.message||e.code));
  }

  // Normalizza: se ho un solo cliente, i -1 diventano 0
  Object.values(map).forEach(v=>{
    if(state.clients.length === 1 && (v.clientIndex == null || v.clientIndex < 0)) v.clientIndex = 0;
  });

  const allDays = Object.values(map).sort((a,b)=>a.id.localeCompare(b.id));
  const days = allDays.filter(v => clientIndex < 0 || v.clientIndex === clientIndex);

  const rows = days.map(v => [
    v.id.slice(-2),
    v.in1||'-', v.out1||'-', v.in2||'-', v.out2||'-',
    (v.ordH||0).toFixed(2), (v.strH||0).toFixed(2),
    v.trasf?'SI':'', v.pern?'SI':'', String(v.km||0),
    v.note?String(v.note):''
  ]);

  const t = state.tariffs||{ord:0,str:0,km:0,trasf:0,pern:0};
  let totOrd=0, totStr=0, totKm=0, nTrasf=0, nPern=0;
  days.forEach(v=>{ totOrd+=v.ordH||0; totStr+=v.strH||0; totKm+=v.km||0; if(v.trasf) nTrasf++; if(v.pern) nPern++; });

  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('jsPDF non caricato. Controlla script in index.html.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();

  // header
  doc.setFillColor(255,10,9);
  doc.rect(0,0,pageW,70,'F');
  try{
    const logo = await imgToDataURL('assets/logo.png');
    doc.addImage(logo,'PNG',(pageW-160)/2,8,160,54);
  }catch(_){}
  const co = state.company || {};
  const companyLines = [
    co.ragione||'',
    [co.piva, co.sdi].filter(Boolean).join('  ·  '),
    [co.indirizzo, co.telefono].filter(Boolean).join('  ·  '),
    co.email||''
  ].filter(Boolean);
  doc.setFontSize(10);
  let yHeader = 86;
  if(companyLines.length){
    doc.text(companyLines, pageW/2, yHeader, {align:'center'});
    yHeader += 6*companyLines.length;
  }
  const title = clientIndex<0 ? `Rapportini ${yyyyMM}` : `Rapportini ${yyyyMM} — ${(state.clients[clientIndex]?.ragione)||''}`;
  doc.setFontSize(12);
  const startYTitle = Math.max(130, yHeader + 20);
  doc.text(title, 20, startYTitle);

  if(typeof doc.autoTable === 'function'){
    doc.autoTable({
      startY: startYTitle + 10,
      styles:{valign:'middle',fontSize:9,cellPadding:4,overflow:'linebreak'},
      headStyles:{fillColor:[255,10,9],textColor:255,fontStyle:'bold'},
      head:[['Giorno','In1','Out1','In2','Out2','Ord','Str','Trsf.','Pern.','KM','Note']],
      body:rows,
      theme:'grid',
      margin:{left:18,right:18},
      columnStyles:{
        0:{cellWidth:34, halign:'center'},
        1:{cellWidth:32}, 2:{cellWidth:32}, 3:{cellWidth:32}, 4:{cellWidth:32},
        5:{cellWidth:36, halign:'right'}, 6:{cellWidth:36, halign:'right'},
        7:{cellWidth:40}, 8:{cellWidth:44}, 9:{cellWidth:32, halign:'right'},
        10:{cellWidth:'auto'}
      }
    });
  }

  // riepilogo su una sola pagina
  const pageH = doc.internal.pageSize.getHeight();
  let startY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 16 : startYTitle + 150;
  if(startY > pageH - 220){ doc.addPage(); startY = 60; }

  const items = [
    ['Ore ordinarie', totOrd.toFixed(2), t.ord.toFixed(2), (totOrd*t.ord).toFixed(2)],
    ['Ore straordinarie', totStr.toFixed(2), t.str.toFixed(2), (totStr*t.str).toFixed(2)],
    ['KM', String(Math.round(totKm)), t.km.toFixed(2), (totKm*t.km).toFixed(2)],
    ['Trasferte', String(nTrasf), t.trasf.toFixed(2), (nTrasf*t.trasf).toFixed(2)],
    ['Pernotti', String(nPern), t.pern.toFixed(2), (nPern*t.pern).toFixed(2)]
  ];

  if(typeof doc.autoTable === 'function'){
    doc.autoTable({
      startY,
      rowPageBreak:'avoid',
      styles:{valign:'middle',fontSize:10,cellPadding:4},
      headStyles:{fillColor:[255,10,9],textColor:255,fontStyle:'bold'},
      head:[['Descrizione','Q.tà','Prezzo','Importo']],
      body: items,
      theme:'grid',
      margin:{left:18,right:18},
      columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:60,halign:'right'},2:{cellWidth:60,halign:'right'},3:{cellWidth:80,halign:'right'}}
    });
    const tot = items.reduce((s, r)=> s + parseFloat(r[3]), 0);
    doc.setFontSize(12);
    doc.text(`Totale: € ${tot.toFixed(2)}`, pageW-18, doc.lastAutoTable.finalY+24, {align:'right'});
  }

  const suffix = clientIndex<0 ? '' : '_' + (state.clients[clientIndex]?.ragione||'cliente').replace(/\s+/g,'_');
  doc.save(`rapportini_${yyyyMM}${suffix}.pdf`);
}
