// BUILD: MOBILE_PDF_OK
const $ = s => document.querySelector(s);
const pad2 = n => String(n).padStart(2,'0');
const fmtIT = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

const state = { user:null, company:{}, clients:[], tariffs:{ord:12,str:25,km:0.4,trasf:50,pern:80,strFest:35} };

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
  const tsel = document.getElementById('tarClientSelect');
  if(tsel){ tsel.onchange = ()=> loadTariffsSelection(); }

  const addBtn = document.getElementById('btnAddCli');
  if(addBtn) addBtn.classList.add('hidden');
  $('#btnDelCli').onclick = delClient;
  $('#btnSaveCli').onclick = saveClientUpsert;
  $('#btnSaveDay').onclick = saveDay;
  $('#btnExportPdf').onclick = exportPdf;
  $('#tabList').onclick = ()=> switchView('list');
  $('#tabCal').onclick  = ()=> switchView('cal');
  $('#closeDayDlg').onclick = ()=> $('#dayDlg').close();
});


function setTariffInputs(t){
  $('#tarOrd').value = (t.ord ?? 0);
  $('#tarStr').value = (t.str ?? 0);
  const tf = document.getElementById('tarStrFest');
  if(tf) tf.value = (t.strFest ?? 0);
  $('#tarKm').value = (t.km ?? 0);
  $('#tarTrasf').value = (t.trasf ?? 0);
  $('#tarPern').value = (t.pern ?? 0);
}

function getTariffInputs(){
  return {
    ord: parseFloat($('#tarOrd').value||'0')||0,
    str: parseFloat($('#tarStr').value||'0')||0,
    strFest: parseFloat((document.getElementById('tarStrFest')?.value)||'0')||0,
    km: parseFloat($('#tarKm').value||'0')||0,
    trasf: parseFloat($('#tarTrasf').value||'0')||0,
    pern: parseFloat($('#tarPern').value||'0')||0
  };
}

function renderTarClientSelect(){
  const sel = document.getElementById('tarClientSelect');
  if(!sel) return;
  const cur = sel.value ?? '-1';
  const opts = ['<option value="-1">Globali (default)</option>','<option value="-2">Senza cliente</option>']
    .concat((state.clients||[]).map((c,i)=>({c,i})).filter(x=>!isEmptyClient(x.c))
      .map(x=>`<option value="${x.i}">${x.c.ragione || ('Cliente '+(x.i+1))}</option>`));
  sel.innerHTML = opts.join('');
  // mantieni selezione se possibile
  if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
}

function loadTariffsSelection(){
  const sel = document.getElementById('tarClientSelect');
  if(!sel) return;
  const v = parseInt(sel.value,10);
  if(isNaN(v) || v === -1){
    setTariffInputs(state.tariffs || {});
    return;
  }
  if(v === -2){
    setTariffInputs(state.tariffsNoClient || state.tariffs || {});
    return;
  }
  const c = state.clients?.[v];
  setTariffInputs((c && c.tariffs) ? c.tariffs : (state.tariffs||{}));
}
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
  const hours = Array.from({length:24},(_,i)=>pad2(i));
  const mins  = ['00','15','30','45'];
  [['#in1h','#in1m'],['#out1h','#out1m'],['#in2h','#in2m'],['#out2h','#out2m']].forEach(([hSel,mSel])=>{
    document.querySelector(hSel).innerHTML = hours.map(h=>'<option>'+h+'</option>').join('');
    document.querySelector(mSel).innerHTML = mins.map(m=>'<option>'+m+'</option>').join('');
  });
}

function timeDiff(a,b){
  if(!a||!b) return 0;
  const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number);
  const d=((bh*60+bm)-(ah*60+am))/60;
  return Math.max(0, d);
}
function getPayload(){
  const h=(sel)=>document.querySelector(sel).value;
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
  const clientIndex = Math.max(-1, (document.getElementById('clientSelect').selectedIndex||0) - 1);
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

  const cliSel = document.getElementById('cliSelect');
  if(cliSel){
    cliSel.onchange = ()=>{
      const i = getSelectedClientIndex();
      if(i>=0) fillClientForm(i);
      else clearClientForm();
    };
  }
  if((state.clients||[]).length>0){
    if(cliSel) cliSel.value = '0';
    fillClientForm(0);
  } else {
    if(cliSel) cliSel.value = '-1';
    clearClientForm();
  }


  const dp = document.getElementById('dayPicker');
  const today = new Date().toISOString().slice(0,10);
  dp.value = dp.value || today;
  dp.addEventListener('change', async e=>{
    await loadDay(e.target.value);
    await loadMonth(e.target.value.slice(0,7));
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
    state.tariffsNoClient = data.tariffsNoClient || null;
    setTariffInputs(state.tariffs);
  }
  const cs = await uref.collection('clients').get();
  state.clients = cs.docs.map(d=>({id:d.id, ...d.data()}));
  renderClients();
  renderTarClientSelect();
  loadTariffsSelection();
}

function isEmptyClient(c){
  if(!c) return true;
  return !(c.ragione||c.piva||c.email||c.tel||c.indirizzo||c.sdi);
}

function getNoClientIndex(){
  return (state.clients||[]).findIndex(isEmptyClient);
}

function renderClients(){
  const selDay  = document.getElementById('clientSelect'); // usato in Compila giornata (clientIndex numerico)
  const selSet  = document.getElementById('cliSelect');    // usato in Impostazioni -> Clienti (usa ID Firestore)

  const real = (state.clients||[]).map((c,i)=>({c,i})).filter(x=>!isEmptyClient(x.c));

  const optsDay = real
    .map(x=>'<option value="'+x.i+'">'+(x.c.ragione||('Cliente '+(x.i+1)))+'</option>').join('');

  const optsSet = real
    .map(x=>'<option value="'+(x.c.id||x.i)+'">'+(x.c.ragione||('Cliente '+(x.i+1)))+'</option>').join('');

  if(selDay){ selDay.innerHTML = '<option>—</option>' + optsDay; }

  if(selSet){
    selSet.innerHTML = '<option value="-1">➕ Nuovo cliente</option>' + optsSet;

    // robust: re-inject option if some browser strips it
    if(![...selSet.options].some(o=>o.value==='-1')){
      const o=document.createElement('option');
      o.value='-1';
      o.textContent='➕ Nuovo cliente';
      selSet.insertBefore(o, selSet.firstChild);
    }
  }

  renderTarClientSelect();
}

function getSelectedClientIndex(){
  const sel = document.getElementById('cliSelect');
  if(!sel) return -1;
  const v = sel.value;
  if(v === '-1') return -1;
  // Prefer mapping by Firestore doc id (stable)
  const idxById = (state.clients||[]).findIndex(c=>String(c.id||'') === String(v));
  if(idxById >= 0) return idxById;
  // Fallback legacy: numeric index
  const i = parseInt(v,10);
  return isNaN(i) ? -1 : i;
}

function clearClientForm(){
  document.getElementById('cliRagione').value = '';
  document.getElementById('cliPiva').value = '';
  document.getElementById('cliEmail').value = '';
  document.getElementById('cliTel').value = '';
  document.getElementById('cliIndirizzo').value = '';
  document.getElementById('cliSdi').value = '';
}

function fillClientForm(i){
  const c = state.clients?.[i];
  document.getElementById('cliRagione').value = c?.ragione || '';
  document.getElementById('cliPiva').value = c?.piva || '';
  document.getElementById('cliEmail').value = c?.email || '';
  document.getElementById('cliTel').value = c?.tel || '';
  document.getElementById('cliIndirizzo').value = c?.indirizzo || '';
  document.getElementById('cliSdi').value = c?.sdi || '';
}

function readClientForm(){
  return {
    ragione: document.getElementById('cliRagione').value || '',
    piva: document.getElementById('cliPiva').value || '',
    email: document.getElementById('cliEmail').value || '',
    tel: document.getElementById('cliTel').value || '',
    indirizzo: document.getElementById('cliIndirizzo').value || '',
    sdi: document.getElementById('cliSdi').value || ''
  };
}



async function saveClientUpsert(){
  const i = getSelectedClientIndex();
  const data = readClientForm();

  // blocca clienti vuoti
  if(isEmptyClient(data)){
    alert('Compila almeno Ragione sociale o P.IVA (cliente vuoto non salvabile)');
    return;
  }

  const col = db.collection('users').doc(state.user.uid).collection('clients');

  // update existing
  if(i >= 0 && state.clients?.[i]){
    Object.assign(state.clients[i], data);
    if(state.clients[i].id){
      await col.doc(state.clients[i].id).set(data, {merge:true});
    }else{
      const ref = await col.add(data);
      state.clients[i].id = ref.id;
    }
    renderClients();
    // mantieni selezione
    const sel = document.getElementById('cliSelect');
    if(sel && state.clients[i].id) sel.value = state.clients[i].id;
    alert('Salvataggio effettuato');
    return;
  }

  // create new
  const ref = await col.add(data);
  state.clients.push({id: ref.id, ...data});
  renderClients();
  const sel = document.getElementById('cliSelect');
  if(sel) sel.value = ref.id;
  alert('Salvataggio effettuato');
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
async function delClient(){
  const sel = document.getElementById('cliSelect');
  if(!sel) return;
  const v = sel.value;
  if(v === '-1'){ alert('Seleziona un cliente da eliminare'); return; }

  const i = getSelectedClientIndex();
  const c = state.clients?.[i];
  if(!c){ alert('Cliente non trovato'); return; }

  if(!confirm(`Eliminare cliente: ${c.ragione || 'Cliente'}?`)) return;

  // delete from Firestore by id (stable)
  if(c.id){
    await db.collection('users').doc(state.user.uid).collection('clients').doc(c.id).delete();
  }
  // update local state
  state.clients.splice(i,1);
  renderClients();
  clearClientForm();
  const sel2 = document.getElementById('cliSelect');
  if(sel2) sel2.value = '-1';
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
  document.querySelector(hSel).value=h; document.querySelector(mSel).value=m;
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
    document.getElementById('clientSelect').selectedIndex = (v.clientIndex??-1)+1;
  }else{
    document.getElementById('km').value=0; document.getElementById('note').value='';
    document.getElementById('chipTrasf').classList.remove('active');
    document.getElementById('chipPern').classList.remove('active');
    document.getElementById('clientSelect').selectedIndex = 0;
  }
}

async function loadMonth(yyyyMM){
  const [y,m] = yyyyMM.split('-').map(Number);
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
  const t = getTariffInputs();

  const sel = document.getElementById('tarClientSelect');
  const v = sel ? parseInt(sel.value,10) : -1;

  // -1 => globali
  if(!sel || isNaN(v) || v === -1){
    state.tariffs = t;
    await db.collection('users').doc(state.user.uid).set({tariffs: t}, {merge:true});
    alert('Tariffe globali salvate');
    return;
  // -2 => Senza cliente
  if(v === -2){
    state.tariffsNoClient = t;
    await db.collection('users').doc(state.user.uid).set({tariffsNoClient: t}, {merge:true});
    alert('Tariffe "Senza cliente" salvate');
    return;
  }

  }

  // tariffe per cliente
  const c = state.clients?.[v];
  if(!c){
    alert('Cliente non valido');
    return;
  }
  c.tariffs = t;

  // Se ho id (doc Firestore), aggiorno quel doc. Altrimenti fallback: salva tutti i clienti.
  if(c.id){
    await db.collection('users').doc(state.user.uid).collection('clients').doc(c.id).set({tariffs: t}, {merge:true});
    alert('Tariffe cliente salvate');
  }else{
    await saveClients();
    alert('Tariffe cliente salvate (salvataggio completo)');
  }
}

async function imgToDataURL(url){
  const r = await fetch(url);
  const b = await r.blob();
  return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
}


async function choosePdfClientIndex(){
  // returns number (clientIndex) or null if cancelled
  const clients = state.clients || [];
  const clientLabel = (c,i)=>{
    const empty = !c || (!c.ragione && !c.piva && !c.email && !c.tel && !c.indirizzo && !c.sdi);
    return empty ? 'Senza cliente' : (c.ragione || ('Cliente ' + (i+1)));
  };
  if(clients.length <= 1) return (clients.length === 1 ? 0 : -1);

  // Use <dialog> if available
  if(typeof HTMLDialogElement !== 'undefined'){
    return await new Promise((resolve)=>{
      const dlg = document.createElement('dialog');
      dlg.style.maxWidth = '420px';
      dlg.style.width = '92vw';
      dlg.innerHTML = `
        <form method="dialog" style="margin:0">
          <h3 style="margin:0 0 10px 0;font-size:16px">Esporta PDF</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <label style="font-size:13px;opacity:.9">Seleziona cliente</label>
            <select id="__pdfClientSel" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.15);color:inherit">
              <option value="-1">Tutti i clienti</option><option value="-2">Senza cliente</option>
              ${clients.map((c,i)=>({c,i})).filter(x=>!isEmptyClient(x.c)).map(x=>`<option value="${x.i}">${x.c.ragione || ('Cliente '+(x.i+1))}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
            <button value="cancel" style="padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit">Annulla</button>
            <button value="ok" style="padding:10px 14px;border-radius:10px;border:0;background:#ff0a09;color:white">Esporta</button>
          </div>
        </form>
      `;
      document.body.appendChild(dlg);
      dlg.addEventListener('close', ()=>{
        try{
          const v = dlg.returnValue;
          if(v !== 'ok'){ dlg.remove(); return resolve(null); }
          const sel = dlg.querySelector('#__pdfClientSel');
          const idx = parseInt(sel.value,10);
          dlg.remove();
          resolve(isNaN(idx)?-1:idx);
        }catch(e){
          dlg.remove();
          resolve(null);
        }
      }, {once:true});
      dlg.showModal();
    });
  }

  // Fallback prompt
  const names = clients.map((c,i)=> i + ': ' + (c.ragione || ('Cliente ' + (i+1))) ).join('\n');
  const ans = prompt('Esporta PDF per:\n- Tutti = -1\n' + names + '\nInserisci indice o -1:', '-1');
  const idx = parseInt(ans||'-1',10);
  return (isNaN(idx)?-1:idx);
}

async function exportPdf(){
  let clientIndex = await choosePdfClientIndex();
  if(clientIndex === null) return;

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

  const days = Object.values(map)
    .filter(v => clientIndex < 0 || v.clientIndex === clientIndex)
    .sort((a,b)=>a.id.localeCompare(b.id));

  // Ora: Data = solo giorno, colonne Ord e Str separate
  const getClientName = (idx)=>{
    const noIdx = getNoClientIndex();
    if(idx==null || idx<0 || idx===noIdx) return 'Senza cliente';
    const c = state.clients?.[idx];
    return (c?.ragione) || ('Cliente ' + (idx+1));
  };

  const rows = days.map(v => {
    const base = [
      v.id.slice(-2),
      v.in1||'-', v.out1||'-', v.in2||'-', v.out2||'-',
      (v.ordH||0).toFixed(2), (v.strH||0).toFixed(2),
      v.trasf?'SI':'', v.pern?'SI':'', String(v.km||0),
      v.note?String(v.note):''
    ];
    // Se export 'Tutti', aggiungo colonna Cliente subito dopo il giorno
    if(clientIndex < 0){
      base.splice(1, 0, getClientName(v.clientIndex));
    }
    return base;
  });
const t = (clientIndex>=0 && state.clients?.[clientIndex]?.tariffs) ? state.clients[clientIndex].tariffs : (state.tariffs||{ord:0,str:0,strFest:0,km:0,trasf:0,pern:0});
  let totOrd=0, totStr=0, totStrFest=0, totKm=0, nTrasf=0, nPern=0;
  days.forEach(v=>{ totOrd+=v.ordH||0; totStr+=v.strH||0; totStrFest+=v.strFestH||0; totKm+=v.km||0; if(v.trasf) nTrasf++; if(v.pern) nPern++; });

  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('jsPDF non caricato. Controlla script in index.html.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();

  // header con banda e logo
  doc.setFillColor(255,10,9);
  doc.rect(0,0,pageW,70,'F');
  try{
    const logo = await imgToDataURL('assets/logo.png');
    doc.addImage(logo,'PNG',(pageW-160)/2,8,160,54);
  }catch(_){}
  const co = state.company || {};
  const cli = (typeof clientIndex === 'number' && clientIndex >= 0) ? (state.clients?.[clientIndex] || null) : null;

  const leftLines = [
    co.ragione||'',
    co.piva ? `P.IVA: ${co.piva}` : '',
    co.sdi ? `SDI: ${co.sdi}` : '',
    co.indirizzo||'',
    co.telefono ? `Tel: ${co.telefono}` : '',
    co.email||''
  ].filter(Boolean);

  const rightLines = cli ? [
    cli.ragione||'',
    cli.piva ? `P.IVA: ${cli.piva}` : '',
    cli.indirizzo||'',
    cli.tel ? `Tel: ${cli.tel}` : '',
    cli.email||''
  ].filter(Boolean) : (clientIndex < 0 ? ['Tutti i clienti'] : []);

  doc.setFontSize(10);
  let yHeader = 86;

  if(leftLines.length){
    doc.text(leftLines, 18, yHeader, {align:'left'});
  }
  if(rightLines.length){
    doc.text(rightLines, pageW - 18, yHeader, {align:'right'});
  }

  // spazio usato dal blocco header (prendo il max fra SX e DX)
  yHeader += 12 * Math.max(leftLines.length, rightLines.length);
  // titolo e spostamento più in basso
  const title = clientIndex<0 ? `Rapportini ${yyyyMM}` : `Rapportini ${yyyyMM} — ${(state.clients[clientIndex]?.ragione)||''}`;
  doc.setFontSize(12);
  const startY = Math.max(130, yHeader + 20);
  doc.text(title, 20, startY);

  // tabella giornaliera
  if(typeof doc.autoTable === 'function'){
    
  const headDays = (clientIndex < 0)
    ? [['Giorno','Cliente','In1','Out1','In2','Out2','Ord','Str','Trsf.','Pern.','KM','Note']]
    : [['Giorno','In1','Out1','In2','Out2','Ord','Str','Trsf.','Pern.','KM','Note']];

  const colDays = (clientIndex < 0)
    ? {
        0:{cellWidth:28, halign:'center'},
        1:{cellWidth:90},
        2:{cellWidth:30}, 3:{cellWidth:30}, 4:{cellWidth:30}, 5:{cellWidth:30},
        6:{cellWidth:34, halign:'right'}, 7:{cellWidth:34, halign:'right'},
        8:{cellWidth:36}, 9:{cellWidth:36}, 10:{cellWidth:30, halign:'right'},
        11:{cellWidth:'auto'}
      }
    : {
        0:{cellWidth:34, halign:'center'},
        1:{cellWidth:32}, 2:{cellWidth:32}, 3:{cellWidth:32}, 4:{cellWidth:32},
        5:{cellWidth:36, halign:'right'}, 6:{cellWidth:36, halign:'right'},
        7:{cellWidth:40}, 8:{cellWidth:44}, 9:{cellWidth:32, halign:'right'},
        10:{cellWidth:'auto'}
      };
doc.autoTable({
      startY: startY + 10,
      styles:{valign:'middle',fontSize:9,cellPadding:4,overflow:'linebreak'},
      headStyles:{fillColor:[255,10,9],textColor:255,fontStyle:'bold'},
      head: headDays,
      body:rows,
      theme:'grid',
      margin:{left:18,right:18},
      columnStyles: colDays
    });
  }else{
    doc.setFontSize(11);
    let yPos = startY + 26;
    rows.forEach(r => { doc.text(r.join(' | '), 20, yPos); yPos+=16; if(yPos>800){ doc.addPage(); yPos=40; } });
  }

  // riepilogo finale
  const getTar = (idx)=>{
    const noIdx = getNoClientIndex();
    if(idx>=0 && state.clients?.[idx]?.tariffs) return state.clients[idx].tariffs;
    if(idx===-2 || idx===noIdx) return state.tariffsNoClient || state.tariffs || {ord:0,str:0,strFest:0,km:0,trasf:0,pern:0};
    return state.tariffs || {ord:0,str:0,strFest:0,km:0,trasf:0,pern:0};
  };

  if(clientIndex < 0){
    // Riepilogo PER CLIENTE con tariffari diversi
    const groups = {};
    days.forEach(v=>{
      const noIdx = getNoClientIndex();
      const idx0 = (v.clientIndex==null ? -2 : v.clientIndex);
      const idx = (idx0===noIdx || idx0<0) ? -2 : idx0;
      if(!groups[idx]) groups[idx] = {ord:0,str:0,km:0,trasf:0,pern:0};
      groups[idx].ord += v.ordH||0;
      groups[idx].str += v.strH||0;
      groups[idx].km  += v.km||0;
      if(v.trasf) groups[idx].trasf += 1;
      if(v.pern)  groups[idx].pern  += 1;
    });

    const rowsCli = [];
    let grand = 0;

    Object.keys(groups).sort((a,b)=>Number(a)-Number(b)).forEach(k=>{
      const idx = Number(k);
      const g = groups[idx];
      const t = getTar(idx);

      const imp =
        g.ord * (t.ord||0) +
        g.str * (t.str||0) +
        g.km  * (t.km||0) +
        g.trasf * (t.trasf||0) +
        g.pern  * (t.pern||0);

      grand += imp;

      const name = (idx>=0 ? (state.clients?.[idx]?.ragione || ('Cliente '+(idx+1))) : 'Senza cliente');
      rowsCli.push([
        name,
        g.ord.toFixed(2),
        g.str.toFixed(2),
        String(Math.round(g.km)),
        String(g.trasf),
        String(g.pern),
        imp.toFixed(2)
      ]);
    });

    const ySum = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : startY+220) + 18;
    doc.autoTable({
      startY: ySum,
      styles:{valign:'middle',fontSize:10,cellPadding:4},
      headStyles:{fillColor:[255,10,9],textColor:255,fontStyle:'bold'},
      head:[['Cliente','Ord(h)','Str(h)','KM','Trsf','Pern','Subtot €']],
      body: rowsCli,
      theme:'grid',
      margin:{left:18,right:18},
      columnStyles:{
        0:{cellWidth:'auto'},
        1:{cellWidth:60,halign:'right'},
        2:{cellWidth:60,halign:'right'},
        3:{cellWidth:46,halign:'right'},
        4:{cellWidth:40,halign:'center'},
        5:{cellWidth:40,halign:'center'},
        6:{cellWidth:80,halign:'right'}
      }
    });

    doc.setFontSize(12);
    doc.text(`Totale generale: € ${grand.toFixed(2)}`, pageW-18, doc.lastAutoTable.finalY+24, {align:'right'});

  } else {
    // Riepilogo singolo cliente (come prima)
    const t = getTar(clientIndex);
    const items = [
      ['Ore ordinarie', totOrd.toFixed(2), (t.ord||0).toFixed(2), (totOrd*(t.ord||0)).toFixed(2)],
      ['Ore straordinarie', totStr.toFixed(2), (t.str||0).toFixed(2), (totStr*(t.str||0)).toFixed(2)],
      ['KM', String(Math.round(totKm)), (t.km||0).toFixed(2), (totKm*(t.km||0)).toFixed(2)],
      ['Trasferte', String(nTrasf), (t.trasf||0).toFixed(2), (nTrasf*(t.trasf||0)).toFixed(2)],
      ['Pernotti', String(nPern), (t.pern||0).toFixed(2), (nPern*(t.pern||0)).toFixed(2)]
    ];
    const totBase = items.reduce((s, r)=> s + parseFloat(r[3]), 0);
    const sogliaBollo = 77.47;
    const bollo = (totBase >= sogliaBollo) ? 2.00 : 0;
    if(bollo > 0){
      items.push(['Imposta di bollo', '1', '2.00', '2.00']);
    }

    const ySum = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : startY+220) + 18;
    doc.autoTable({
      startY: ySum,
      styles:{valign:'middle',fontSize:10,cellPadding:4},
      headStyles:{fillColor:[255,10,9],textColor:255,fontStyle:'bold'},
      head:[['Descrizione','Q.tà','Prezzo','Importo']],
      body: items,
      theme:'grid',
      margin:{left:18,right:18},
      columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:60,halign:'right'},2:{cellWidth:60,halign:'right'},3:{cellWidth:80,halign:'right'}}
    });
    const tot = totBase + bollo;
    doc.setFontSize(12);
    doc.text('Totale: € ' + tot.toFixed(2), pageW-18, doc.lastAutoTable.finalY+24, {align:'right'});
  }

  const suffix = clientIndex<0 ? '' : '_' + (state.clients[clientIndex]?.ragione||'cliente').replace(/\s+/g,'_');
  doc.save(`rapportini_${yyyyMM}${suffix}.pdf`);

}
