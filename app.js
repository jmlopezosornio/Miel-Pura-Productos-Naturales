const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random());

const seedProducts = [
 ['Miel 1kg','1 kg',23,5000,10000],['Miel 1/2kg','1/2 kg',8,3000,6000],['Almendras','1/2 kg',8,8500,11000],
 ['Nueces','1/2 kg',2,9000,12000],['Aceite','1 L',2,8000,12000],['Aceituna','1 kg',3,8000,13000],
 ['Ciruelas','1/2 kg',2,4250,7000],['Maní','1/2 kg',8,1500,5000],['Cajú','1/2 kg',2,8500,11000],
 ['Mix sin maní','1/2 kg',1,6750,10000],['Mix tropical','1/2 kg',15,6250,9000],['Granola','1 kg',6,6500,12000],
 ['Pasas de uva','1/2 kg',5,3000,6000],['Coco','1/2 kg',0,5750,8000],['Chip Banana','1/2 kg',4,5500,8000],
 ['Aceitunas Negras','1 kg',6,9500,15000],['Avellanas','1/2 kg',0,15000,20000],['Miel Cremosa','1 kg',14,5000,15000]
].map((p,i)=>({id:'seed-'+(i+1),name:p[0],presentation:p[1],stock:p[2],cost:p[3],price:p[4],active:true}));

const initialState = {products:seedProducts,entries:[],sales:[],payments:[],openingDebt:475000};

class LocalStore {
  constructor(){this.key='miel_stock_app_v1';}
  load(){const raw=localStorage.getItem(this.key); if(!raw){this.save(initialState);return structuredClone(initialState)}; try{return JSON.parse(raw)}catch{return structuredClone(initialState)}}
  save(s){localStorage.setItem(this.key,JSON.stringify(s))}
}

const local = new LocalStore();
let state = local.load();
let supa = null;
let remoteMode = false;

async function initStorage(){
  const cfg=window.APP_CONFIG||{};
  if(cfg.USE_SUPABASE && cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('TU-PROYECTO')){
    try{
      supa=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY); remoteMode=true;
      $('#storageBadge').textContent='Supabase conectado';
      const {data:{session}}=await supa.auth.getSession();
      if(!session){ await requireLogin(); }
      await pullRemote();
    }catch(e){console.error(e); $('#loginError').textContent=e.message||'No se pudo conectar'; throw e;}
  }
}
async function requireLogin(){
  const screen=$('#loginScreen'), login=$('#loginForm'), error=$('#loginError');
  screen.classList.add('show');
  return new Promise(resolve=>{
    login.onsubmit=async e=>{
      e.preventDefault(); error.textContent='';
      const d=Object.fromEntries(new FormData(login));
      const {error:authError}=await supa.auth.signInWithPassword({email:d.email,password:d.password});
      if(authError){error.textContent='Email o contraseña incorrectos';return;}
      screen.classList.remove('show'); resolve();
    };
  });
}

async function pullRemote(){
  const [p,e,s,pa]=await Promise.all([
    supa.from('products').select('*').order('name'),supa.from('entries').select('*').order('date',{ascending:false}),
    supa.from('sales').select('*').order('date',{ascending:false}),supa.from('payments').select('*').order('date',{ascending:false})
  ]);
  if(p.error) throw p.error;
  if(!p.data.length){
    const rows=seedProducts.map(x=>({id:x.id,name:x.name,presentation:x.presentation,stock:x.stock,cost:x.cost,price:x.price,active:true}));
    const ins=await supa.from('products').insert(rows); if(ins.error) throw ins.error;
    state={...initialState};
  } else {
    state={products:p.data,entries:e.data||[],sales:s.data||[],payments:pa.data||[],openingDebt:0};
  }
}
async function persist(){ if(!remoteMode) local.save(state); }

function render(){renderDashboard();renderStock();renderEntries();renderSales();renderPayments();}
function stockCost(){return state.products.reduce((a,p)=>a+Number(p.stock)*Number(p.cost||0),0)}
function stockSale(){return state.products.reduce((a,p)=>a+Number(p.stock)*Number(p.price||0),0)}
function salesTotal(){return state.sales.reduce((a,s)=>a+Number(s.total||0),0)}
function collectedFromSales(){return state.sales.reduce((a,s)=>a+Number(s.paid||0),0)}
function paymentsTotal(){return state.payments.reduce((a,p)=>a+Number(p.amount||0),0)}
function debtTotal(){return Math.max(0,Number(state.openingDebt||0)+salesTotal()-collectedFromSales()-paymentsTotal())}

function renderDashboard(){
 $('#kpiStockCost').textContent=money(stockCost()); $('#kpiStockSale').textContent=money(stockSale()); $('#kpiSales').textContent=money(salesTotal());
 $('#kpiSalesCount').textContent=`${state.sales.length} ${state.sales.length===1?'operación':'operaciones'}`; $('#kpiDebt').textContent=money(debtTotal());
 const lows=state.products.filter(p=>Number(p.stock)<=5).sort((a,b)=>a.stock-b.stock);
 $('#lowStockList').innerHTML=lows.length?lows.slice(0,8).map(p=>`<div class="mini-row"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.presentation||'')}</div></div><span class="badge ${p.stock<=2?'low':''}">${p.stock} u.</span></div>`).join(''):'<div class="empty">Sin alertas de stock</div>';
 const movements=[...state.entries.map(x=>({...x,type:'Entrada',amount:x.total})),...state.sales.map(x=>({...x,type:'Venta',amount:x.total})),...state.payments.map(x=>({...x,type:'Pago',amount:x.amount}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);
 $('#recentList').innerHTML=movements.length?movements.map(m=>`<div class="mini-row"><div><strong>${m.type}</strong><div class="muted">${fmtDate(m.date)} · ${esc(m.product_name||m.client||m.note||'')}</div></div><span class="badge">${money(m.amount)}</span></div>`).join(''):'<div class="empty">Todavía no hay movimientos nuevos.</div>';
}
function renderStock(){const q=($('#stockSearch')?.value||'').toLowerCase();const rows=state.products.filter(p=>p.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));$('#stockTable').innerHTML=rows.map(p=>`<tr title="Doble clic para editar" ondblclick="editProduct('${p.id}')"><td><strong>${esc(p.name)}</strong></td><td>${esc(p.presentation||'')}</td><td><span class="badge ${p.stock<=2?'low':p.stock<=5?'':'ok'}">${p.stock}</span></td><td>${money(p.price)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin productos</td></tr>'}
function renderEntries(){$('#entriesTable').innerHTML=state.entries.slice().sort(descDate).map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${esc(x.product_name)}</td><td>${x.qty}</td><td>${money(x.unit_cost)}</td><td>${money(x.total)}</td><td>${esc(x.note||'')}</td><td><button class="btn danger small" type="button" onclick="deleteEntry('${x.id}')">Eliminar</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No hay entradas registradas todavía</td></tr>'}
function renderSales(){$('#salesTable').innerHTML=state.sales.slice().sort(descDate).map(x=>{const bal=Number(x.total)-Number(x.paid||0);return `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.client||'Consumidor final')}</td><td>${esc(x.product_name)}</td><td>${x.qty}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td><td class="money ${bal>0?'negative':''}">${money(bal)}</td><td>${esc(x.method||'')}</td><td><button class="btn danger small" type="button" onclick="deleteSale('${x.id}')">Eliminar</button></td></tr>`}).join('')||'<tr><td colspan="9" class="empty">No hay ventas registradas todavía</td></tr>'}
function renderPayments(){$('#paymentsTable').innerHTML=state.payments.slice().sort(descDate).map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${esc(x.client||'')}</td><td>${money(x.amount)}</td><td>${esc(x.method||'')}</td><td>${esc(x.note||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No hay pagos registrados todavía</td></tr>'}
function descDate(a,b){return String(b.date).localeCompare(String(a.date))}
function fmtDate(s){if(!s)return '';const [y,m,d]=String(s).slice(0,10).split('-');return `${d}/${m}/${y}`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));$('#pageTitle').textContent={dashboard:'Resumen',stock:'Stock',entradas:'Entradas',ventas:'Ventas',pagos:'Pagos'}[id]||id;}
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#stockSearch').addEventListener('input',renderStock);

const modal=$('#modal'), form=$('#modalForm');
function closeModal(){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
$('#closeModal').onclick=closeModal;modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
function openForm(title,html,onSubmit){$('#modalTitle').textContent=title;form.innerHTML=html+`<div class="form-actions"><button type="button" class="btn secondary" id="cancelForm">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>`;form.onsubmit=onSubmit;$('#cancelForm').onclick=closeModal;modal.classList.add('show');modal.setAttribute('aria-hidden','false')}
function field(label,name,type='text',value='',extra='',full=''){return `<div class="field ${full}"><label>${label}</label><input class="input" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function selectField(label,name,options,full=''){return `<div class="field ${full}"><label>${label}</label><select class="select" name="${name}">${options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>`}
function productOptions(){return state.products.filter(p=>p.active!==false).map(p=>({value:p.id,label:`${p.name} · stock ${p.stock}`}))}

$('#newProductBtn').onclick=()=>productForm();
window.editProduct=id=>productForm(state.products.find(p=>p.id===id));
function productForm(p=null){openForm(p?'Editar producto':'Nuevo producto',field('Producto','name','text',p?.name||'','required')+field('Presentación','presentation','text',p?.presentation||'')+field('Stock actual','stock','number',p?.stock??0,'min="0" step="1" required')+field('Costo unitario','cost','number',p?.cost??0,'min="0" step="0.01" required')+field('Precio de venta','price','number',p?.price??0,'min="0" step="0.01" required'),async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const obj={id:p?.id||uid(),name:d.name.trim(),presentation:d.presentation.trim(),stock:Number(d.stock),cost:Number(d.cost),price:Number(d.price),active:true};if(remoteMode){const {error}=await supa.from('products').upsert(obj);if(error)return toast(error.message)} if(p)Object.assign(p,obj);else state.products.push(obj);await persist();closeModal();render();toast('Producto guardado')})}

$('#newEntryBtn').onclick=()=>{if(!state.products.length)return toast('Primero cargá un producto');openForm('Registrar entrada',field('Fecha','date','date',today(),'required')+selectField('Producto','product_id',productOptions())+field('Cantidad','qty','number',1,'min="1" step="1" required')+field('Costo unitario','unit_cost','number',0,'min="0" step="0.01" required')+field('Nota','note','text','','','full'),async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const p=state.products.find(x=>x.id===d.product_id);const x={id:uid(),date:d.date,product_id:p.id,product_name:p.name,qty:Number(d.qty),unit_cost:Number(d.unit_cost),total:Number(d.qty)*Number(d.unit_cost),note:d.note||''};const newStock=Number(p.stock)+x.qty;if(remoteMode){const ins=await supa.from('entries').insert(x);if(ins.error)return toast(ins.error.message);const up=await supa.from('products').update({stock:newStock,cost:x.unit_cost}).eq('id',p.id);if(up.error)return toast(up.error.message)} state.entries.push(x);p.stock=newStock;p.cost=x.unit_cost;await persist();closeModal();render();toast('Entrada registrada')})};

$$('[data-open-sale]').forEach(b=>b.onclick=()=>openSale());
function openSale(){if(!state.products.some(p=>p.stock>0))return toast('No hay productos con stock disponible');openForm('Nueva venta',field('Fecha','date','date',today(),'required')+field('Cliente','client','text','Consumidor final')+selectField('Producto','product_id',productOptions())+field('Cantidad','qty','number',1,'min="1" step="1" required')+field('Precio unitario','unit_price','number',0,'min="0" step="0.01" required')+field('Cobrado ahora','paid','number',0,'min="0" step="0.01" required')+selectField('Medio de pago','method',[{value:'Efectivo',label:'Efectivo'},{value:'Transferencia',label:'Transferencia'},{value:'Cuenta corriente',label:'Cuenta corriente'},{value:'Otro',label:'Otro'}]),async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const p=state.products.find(x=>x.id===d.product_id);const qty=Number(d.qty);if(qty>Number(p.stock))return toast(`Stock insuficiente: quedan ${p.stock} unidades`);const price=Number(d.unit_price)||Number(p.price);const total=qty*price;const paid=Math.min(Number(d.paid||0),total);const x={id:uid(),date:d.date,client:d.client||'Consumidor final',product_id:p.id,product_name:p.name,qty,unit_price:price,total,paid,method:d.method};const newStock=Number(p.stock)-qty;if(remoteMode){const ins=await supa.from('sales').insert(x);if(ins.error)return toast(ins.error.message);const up=await supa.from('products').update({stock:newStock,price}).eq('id',p.id);if(up.error)return toast(up.error.message)}state.sales.push(x);p.stock=newStock;p.price=price;await persist();closeModal();render();toast('Venta registrada')});setTimeout(()=>{const sel=form.elements.product_id,price=form.elements.unit_price,paid=form.elements.paid;const update=()=>{const p=state.products.find(x=>x.id===sel.value);if(p)price.value=p.price};sel.onchange=update;update();paid.value=0},0)}


window.deleteEntry=async id=>{
  const entry=state.entries.find(x=>x.id===id);
  if(!entry)return toast('No se encontró la entrada');
  const p=state.products.find(x=>x.id===entry.product_id);
  if(!p)return toast('No se encontró el producto asociado a la entrada');
  const qty=Number(entry.qty||0);
  const currentStock=Number(p.stock||0);
  if(currentStock<qty){
    return toast(`No se puede eliminar: el stock actual es ${currentStock} y esta entrada agregó ${qty} unidades`);
  }
  const ok=window.confirm(`¿Está seguro que quiere borrar este registro?

${entry.product_name} · ${qty} unidad(es) · ${money(entry.total)}

Al eliminarlo, el stock disminuirá en ${qty} unidad(es).`);
  if(!ok)return;
  const adjustedStock=currentStock-qty;
  if(remoteMode){
    const up=await supa.from('products').update({stock:adjustedStock}).eq('id',p.id);
    if(up.error)return toast('No se pudo ajustar el stock: '+up.error.message);
    const del=await supa.from('entries').delete().eq('id',entry.id);
    if(del.error){
      await supa.from('products').update({stock:currentStock}).eq('id',p.id);
      return toast('No se pudo eliminar la entrada: '+del.error.message);
    }
  }
  p.stock=adjustedStock;
  state.entries=state.entries.filter(x=>x.id!==id);
  await persist();
  render();
  toast('Entrada eliminada y stock ajustado');
};


window.deleteSale=async id=>{
  const sale=state.sales.find(x=>x.id===id);
  if(!sale)return toast('No se encontró la venta');
  const ok=window.confirm(`¿Está seguro que quiere borrar este registro?\n\n${sale.product_name} · ${sale.qty} unidad(es) · ${money(sale.total)}\n\nAl eliminarlo, el stock volverá a sumar ${sale.qty} unidad(es).`);
  if(!ok)return;
  const p=state.products.find(x=>x.id===sale.product_id);
  if(!p)return toast('No se encontró el producto asociado a la venta');
  const previousStock=Number(p.stock||0);
  const restoredStock=previousStock+Number(sale.qty||0);
  if(remoteMode){
    const up=await supa.from('products').update({stock:restoredStock}).eq('id',p.id);
    if(up.error)return toast('No se pudo reponer el stock: '+up.error.message);
    const del=await supa.from('sales').delete().eq('id',sale.id);
    if(del.error){
      await supa.from('products').update({stock:previousStock}).eq('id',p.id);
      return toast('No se pudo eliminar la venta: '+del.error.message);
    }
  }
  p.stock=restoredStock;
  state.sales=state.sales.filter(x=>x.id!==id);
  await persist();
  render();
  toast('Venta eliminada y stock repuesto');
};

$('#newPaymentBtn').onclick=()=>openForm('Registrar pago',field('Fecha','date','date',today(),'required')+field('Cliente','client','text','','required')+field('Importe','amount','number',0,'min="0.01" step="0.01" required')+selectField('Medio de pago','method',[{value:'Efectivo',label:'Efectivo'},{value:'Transferencia',label:'Transferencia'},{value:'Otro',label:'Otro'}])+field('Nota','note','text','','','full'),async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const x={id:uid(),date:d.date,client:d.client,amount:Number(d.amount),method:d.method,note:d.note||''};if(remoteMode){const ins=await supa.from('payments').insert(x);if(ins.error)return toast(ins.error.message)}state.payments.push(x);await persist();closeModal();render();toast('Pago registrado')});

$('#backupBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`miel-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Copia exportada')};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2400)}

(async()=>{await initStorage();showView('dashboard');render()})();
