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

const initialState = {products:seedProducts,entries:[],sales:[],payments:[],supplierPayments:[],openingDebt:475000};

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

async function uploadLocalStateToRemote(){
  // Primera migración: si Supabase está vacío, copiamos los datos que ya existen
  // en el navegador actual para no perder ventas, entradas, pagos ni stock.
  const products=state.products.map(x=>({
    id:String(x.id), name:x.name, presentation:x.presentation||'',
    stock:Number(x.stock||0), cost:Number(x.cost||0), price:Number(x.price||0),
    active:x.active!==false
  }));
  if(products.length){
    const r=await supa.from('products').upsert(products);
    if(r.error) throw r.error;
  }
  const entries=state.entries.map(x=>({...x,id:String(x.id),product_id:String(x.product_id)}));
  const sales=state.sales.map(x=>({...x,id:String(x.id),product_id:String(x.product_id)}));
  const payments=state.payments.map(x=>({...x,id:String(x.id)}));
  const supplierPayments=(state.supplierPayments||[]).map(x=>({...x,id:String(x.id)}));
  if(entries.length){const r=await supa.from('entries').upsert(entries); if(r.error) throw r.error;}
  if(sales.length){const r=await supa.from('sales').upsert(sales); if(r.error) throw r.error;}
  if(payments.length){const r=await supa.from('payments').upsert(payments); if(r.error) throw r.error;}
  if(supplierPayments.length){const r=await supa.from('supplier_payments').upsert(supplierPayments); if(r.error) throw r.error;}
  const setr=await supa.from('app_settings').upsert({id:1,opening_debt:Number(state.openingDebt||0)});
  if(setr.error) throw setr.error;
}

async function pullRemote({allowInitialMigration=true}={}){
  const [p,e,s,pa,sp,st]=await Promise.all([
    supa.from('products').select('*').order('name'),
    supa.from('entries').select('*').order('date',{ascending:false}),
    supa.from('sales').select('*').order('date',{ascending:false}),
    supa.from('payments').select('*').order('date',{ascending:false}),
    supa.from('supplier_payments').select('*').order('date',{ascending:false}),
    supa.from('app_settings').select('*').eq('id',1).maybeSingle()
  ]);
  for(const r of [p,e,s,pa,sp,st]) if(r.error) throw r.error;

  if(!p.data.length && allowInitialMigration){
    await uploadLocalStateToRemote();
    return pullRemote({allowInitialMigration:false});
  }

  state={
    products:p.data||[],
    entries:e.data||[],
    sales:s.data||[],
    payments:pa.data||[],
    supplierPayments:sp.data||[],
    openingDebt:Number(st.data?.opening_debt||0)
  };
}

let syncTimer=null;
let syncBusy=false;
async function syncFromRemote({silent=true}={}){
  if(!remoteMode || syncBusy) return;
  syncBusy=true;
  try{
    await pullRemote({allowInitialMigration:false});
    render();
    if(!silent) toast('Datos sincronizados');
  }catch(err){
    console.error('Error de sincronización',err);
    if(!silent) toast('No se pudo sincronizar');
  }finally{syncBusy=false;}
}

function startAutoSync(){
  if(!remoteMode || syncTimer) return;
  // Sincroniza en segundo plano y también al volver a la pestaña/app.
  syncTimer=setInterval(()=>syncFromRemote({silent:true}),10000);
  window.addEventListener('focus',()=>syncFromRemote({silent:true}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') syncFromRemote({silent:true});
  });
}
async function persist(){ if(!remoteMode) local.save(state); }

function render(){renderDashboard();renderStock();renderEntries();renderSales();renderPayments();renderSupplierPayments();}
function stockCost(){return state.products.reduce((a,p)=>a+Number(p.stock)*Number(p.cost||0),0)}
function stockSale(){return state.products.reduce((a,p)=>a+Number(p.stock)*Number(p.price||0),0)}
function salesTotal(){return state.sales.reduce((a,s)=>a+Number(s.total||0),0)}
function collectedFromSales(){return state.sales.reduce((a,s)=>a+Number(s.paid||0),0)}
function paymentsTotal(){return state.payments.reduce((a,p)=>a+Number(p.amount||0),0)}
function debtTotal(){return Math.max(0,Number(state.openingDebt||0)+salesTotal()-collectedFromSales()-paymentsTotal())}
function supplierPurchasesTotal(){return state.entries.reduce((a,x)=>a+Number(x.total||0),0)}
function supplierPaidTotal(){return (state.supplierPayments||[]).reduce((a,x)=>a+Number(x.amount||0),0)}
function supplierDebtTotal(){return Math.max(0,supplierPurchasesTotal()-supplierPaidTotal())}
function supplierNames(){return [...new Set(entryGroups().map(g=>g.supplier).filter(x=>x&&x!=='Sin proveedor'))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}))}
function supplierBalances(){
  const m=new Map();
  entryGroups().forEach(g=>{const k=g.supplier||'Sin proveedor';if(!m.has(k))m.set(k,{supplier:k,purchases:0,paid:0});m.get(k).purchases+=Number(g.total||0)});
  (state.supplierPayments||[]).forEach(x=>{const k=x.supplier||'Sin proveedor';if(!m.has(k))m.set(k,{supplier:k,purchases:0,paid:0});m.get(k).paid+=Number(x.amount||0)});
  return [...m.values()].map(x=>({...x,balance:Math.max(0,x.purchases-x.paid)})).sort((a,b)=>b.balance-a.balance||a.supplier.localeCompare(b.supplier,'es',{sensitivity:'base'}));
}
function operationGroups(rows){
  const map=new Map();
  rows.forEach(x=>{
    const key=x.operation_id||x.id;
    if(!map.has(key)) map.set(key,{id:key,date:x.date,items:[],legacy:!x.operation_id});
    const g=map.get(key); g.items.push(x);
    if(String(x.date)>String(g.date)) g.date=x.date;
  });
  return [...map.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function entryGroups(){return operationGroups(state.entries).map(g=>({...g,total:g.items.reduce((a,x)=>a+Number(x.total||0),0),note:g.items.find(x=>x.note)?.note||'',supplier:g.items.find(x=>x.supplier)?.supplier||'Sin proveedor'}))}
function saleGroups(){return operationGroups(state.sales).map(g=>({...g,total:g.items.reduce((a,x)=>a+Number(x.total||0),0),paid:g.items.reduce((a,x)=>a+Number(x.paid||0),0),client:g.items[0]?.client||'Consumidor final',method:g.items[0]?.method||''}))}
function operationDetail(items,valueKey){return items.map(x=>`<div class="op-line"><strong>${esc(x.product_name)}</strong><span>${Number(x.qty)} u. × ${money(x[valueKey])} = ${money(x.total)}</span></div>`).join('')}

function renderDashboard(){
 const salesOps=saleGroups();
 $('#kpiStockCost').textContent=money(stockCost()); $('#kpiStockSale').textContent=money(stockSale()); $('#kpiSales').textContent=money(salesTotal());
 $('#kpiSalesCount').textContent=`${salesOps.length} ${salesOps.length===1?'operación':'operaciones'}`; $('#kpiDebt').textContent=money(debtTotal());
 const lows=state.products.filter(p=>Number(p.stock)<=5).sort((a,b)=>a.stock-b.stock);
 $('#lowStockList').innerHTML=lows.length?lows.slice(0,8).map(p=>`<div class="mini-row"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.presentation||'')}</div></div><span class="badge ${p.stock<=2?'low':''}">${p.stock} u.</span></div>`).join(''):'<div class="empty">Sin alertas de stock</div>';
 const movements=[...entryGroups().map(g=>({date:g.date,type:'Entrada',label:g.supplier&&g.supplier!=='Sin proveedor'?g.supplier:(g.items.length===1?g.items[0].product_name:`${g.items.length} productos`),amount:g.total})),...saleGroups().map(g=>({date:g.date,type:'Venta',label:g.client,amount:g.total})),...state.payments.map(x=>({...x,type:'Cobranza',label:x.client||x.note||'',amount:x.amount})),...(state.supplierPayments||[]).map(x=>({...x,type:'Pago proveedor',label:x.supplier||x.note||'',amount:x.amount}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);
 $('#recentList').innerHTML=movements.length?movements.map(m=>`<div class="mini-row"><div><strong>${m.type}</strong><div class="muted">${fmtDate(m.date)} · ${esc(m.label||'')}</div></div><span class="badge">${money(m.amount)}</span></div>`).join(''):'<div class="empty">Todavía no hay movimientos nuevos.</div>';
}
function renderStock(){const q=($('#stockSearch')?.value||'').toLowerCase();const rows=state.products.filter(p=>p.active!==false&&p.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));$('#stockTable').innerHTML=rows.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.presentation||'')}</td><td><span class="badge ${p.stock<=2?'low':p.stock<=5?'':'ok'}">${p.stock}</span></td><td>${money(p.price)}</td><td><div class="row-actions compact-actions"><button class="icon-action edit" type="button" title="Editar producto" aria-label="Editar producto" onclick="editProduct('${p.id}')">✏️</button><button class="icon-action delete" type="button" title="Eliminar producto" aria-label="Eliminar producto" onclick="deleteProduct('${p.id}')">🗑</button></div></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sin productos</td></tr>'}
function renderEntries(){$('#entriesTable').innerHTML=entryGroups().map(g=>`<tr><td>${fmtDate(g.date)}</td><td><strong>${esc(g.supplier||'Sin proveedor')}</strong></td><td><div class="op-detail">${operationDetail(g.items,'unit_cost')}</div></td><td><strong>${money(g.total)}</strong></td><td>${esc(g.note||'')}</td><td><div class="row-actions"><button class="btn secondary small" type="button" onclick="downloadEntryPdf('${g.id}')">PDF</button><button class="btn share small" type="button" onclick="shareEntryPdf('${g.id}')">Compartir</button><button class="btn danger small" type="button" onclick="deleteEntry('${g.id}')">Eliminar</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No hay entradas registradas todavía</td></tr>'}
function renderSales(){$('#salesTable').innerHTML=saleGroups().map(g=>{const summary=g.items.map(x=>`${x.product_name}: ${x.qty} u. × ${money(x.unit_price)} = ${money(x.total)}`).join(' · ');return `<tr title="${esc(summary)}"><td>${fmtDate(g.date)}</td><td>${esc(g.client)}</td><td><strong>${money(g.total)}</strong></td><td>${money(g.paid)}</td><td>${esc(g.method||'')}</td><td><div class="row-actions compact-actions"><button class="icon-action pdf" type="button" title="Descargar PDF" aria-label="Descargar PDF" onclick="downloadSalePdf('${g.id}')">📄</button><button class="icon-action share" type="button" title="Compartir" aria-label="Compartir" onclick="shareSalePdf('${g.id}')">📤</button><button class="icon-action delete" type="button" title="Eliminar venta" aria-label="Eliminar venta" onclick="deleteSale('${g.id}')">🗑</button></div></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay ventas registradas todavía</td></tr>'}
function renderPayments(){$('#paymentsTable').innerHTML=state.payments.slice().sort(descDate).map(x=>`<tr><td>${fmtDate(x.date)}</td><td>${esc(x.client||'')}</td><td>${money(x.amount)}</td><td>${esc(x.method||'')}</td><td>${esc(x.note||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No hay pagos registrados todavía</td></tr>'}
function renderSupplierPayments(){
  if(!$('#supplierPaymentsTable'))return;
  $('#kpiSupplierPurchases').textContent=money(supplierPurchasesTotal());
  $('#kpiSupplierPaid').textContent=money(supplierPaidTotal());
  $('#kpiSupplierDebt').textContent=money(supplierDebtTotal());
  $('#supplierBalancesTable').innerHTML=supplierBalances().map(x=>`<tr><td><strong>${esc(x.supplier)}</strong></td><td>${money(x.purchases)}</td><td>${money(x.paid)}</td><td class="money ${x.balance>0?'negative':''}"><strong>${money(x.balance)}</strong></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Todavía no hay proveedores asociados a entradas</td></tr>';
  $('#supplierPaymentsTable').innerHTML=(state.supplierPayments||[]).slice().sort(descDate).map(x=>`<tr><td>${fmtDate(x.date)}</td><td><strong>${esc(x.supplier||'')}</strong></td><td>${money(x.amount)}</td><td>${esc(x.method||'')}</td><td>${x.receipt_path?`<button class="btn secondary small" type="button" onclick="openSupplierReceipt('${x.id}')">Ver</button>`:`<button class="btn secondary small" type="button" onclick="attachSupplierReceipt('${x.id}')">Adjuntar</button>`}</td><td><button class="icon-action delete" type="button" title="Eliminar pago" aria-label="Eliminar pago" onclick="deleteSupplierPayment('${x.id}')">🗑</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No hay pagos a proveedores registrados todavía</td></tr>';
}
function descDate(a,b){return String(b.date).localeCompare(String(a.date))}
function fmtDate(s){if(!s)return '';const [y,m,d]=String(s).slice(0,10).split('-');return `${d}/${m}/${y}`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));$('#pageTitle').textContent={dashboard:'Resumen',stock:'Stock',entradas:'Entradas',ventas:'Ventas',cobranza:'Cobranza',proveedores:'Pagos'}[id]||id;}
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


window.deleteProduct=async id=>{
  const p=state.products.find(x=>x.id===id);
  if(!p)return toast('No se encontró el producto');
  if(Number(p.stock)!==0)return toast(`No se puede eliminar ${p.name}: el stock debe estar en 0`);
  const ok=window.confirm(`¿Está seguro que quiere eliminar este producto?\n\n${p.name} · ${p.presentation||'Sin presentación'}\n\nEl producto dejará de aparecer en Stock y en las nuevas operaciones. El historial anterior se conserva.`);
  if(!ok)return;
  if(remoteMode){
    const {error}=await supa.from('products').update({active:false}).eq('id',p.id);
    if(error)return toast('No se pudo eliminar el producto: '+error.message);
  }
  p.active=false;
  await persist();render();toast('Producto eliminado');
};

function cartBuilderHtml(kind){
  const isEntry=kind==='entry';
  return `<div class="cart-builder full">
    <div class="cart-add-row">
      <div class="field"><label>Producto</label><select class="select" id="cartProduct">${productOptions().map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Cantidad</label><input class="input" id="cartQty" type="number" min="1" step="1" value="1"></div>
      <div class="field"><label>${isEntry?'Costo unitario':'Valor de venta'}</label><input class="input" id="cartValue" type="number" min="0" step="0.01" value="0"></div>
      <button class="btn secondary cart-add-btn" type="button" id="cartAdd">＋ Agregar</button>
    </div>
    <div id="cartItems" class="cart-items"></div>
    <div class="cart-total"><span>Total ${isEntry?'del pedido':'de la venta'}</span><strong id="cartTotal">${money(0)}</strong></div>
  </div>`;
}
function setupCart(kind,cart){
  const product=$('#cartProduct'),qty=$('#cartQty'),value=$('#cartValue'),items=$('#cartItems'),total=$('#cartTotal'),add=$('#cartAdd');
  const key=kind==='entry'?'cost':'price';
  const refreshValue=()=>{const p=state.products.find(x=>x.id===product.value);if(p)value.value=Number(p?.[key]||0)};
  const draw=()=>{
    items.innerHTML=cart.length?cart.map((x,i)=>`<div class="cart-item"><div><strong>${esc(x.product_name)}</strong><span>${x.qty} u. × ${money(x.unit_value)}</span></div><strong>${money(x.qty*x.unit_value)}</strong><button type="button" class="cart-remove" data-i="${i}" aria-label="Quitar">×</button></div>`).join(''):'<div class="cart-empty">Agregá uno o más productos.</div>';
    total.textContent=money(cart.reduce((a,x)=>a+x.qty*x.unit_value,0));
    items.querySelectorAll('.cart-remove').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.i),1);draw()});
  };
  product.onchange=refreshValue;refreshValue();draw();
  add.onclick=()=>{
    const p=state.products.find(x=>x.id===product.value),q=Number(qty.value),v=Number(value.value);
    if(!p||q<=0||v<0)return toast('Revisá producto, cantidad y valor');
    const existing=cart.find(x=>x.product_id===p.id && Number(x.unit_value)===v);
    if(existing)existing.qty+=q;else cart.push({product_id:p.id,product_name:p.name,qty:q,unit_value:v});
    qty.value=1;draw();
  };
  return draw;
}

$('#newEntryBtn').onclick=()=>openEntry();
function openEntry(){
  if(!state.products.length)return toast('Primero cargá un producto');
  const cart=[];
  openForm('Registrar entrada',field('Fecha','date','date',today(),'required')+field('Proveedor','supplier','text','','required')+field('Nota','note','text','','','full')+cartBuilderHtml('entry'),async e=>{
    e.preventDefault(); if(!cart.length)return toast('Agregá al menos un producto');
    const d=Object.fromEntries(new FormData(e.target)),operationId=uid();
    const rows=cart.map((x,i)=>({id:uid(),operation_id:operationId,date:d.date,supplier:(d.supplier||'').trim(),product_id:x.product_id,product_name:x.product_name,qty:Number(x.qty),unit_cost:Number(x.unit_value),total:Number(x.qty)*Number(x.unit_value),note:i===0?(d.note||''):''}));
    const qtyByProduct=new Map();rows.forEach(r=>qtyByProduct.set(r.product_id,(qtyByProduct.get(r.product_id)||0)+r.qty));
    const changes=[...qtyByProduct].map(([pid,q])=>{const p=state.products.find(x=>x.id===pid);const last=rows.filter(r=>r.product_id===pid).at(-1);return {p,oldStock:Number(p.stock),oldCost:Number(p.cost),newStock:Number(p.stock)+q,newCost:last.unit_cost}});
    if(remoteMode){
      const ins=await supa.from('entries').insert(rows);if(ins.error)return toast(ins.error.message);
      for(const c of changes){const up=await supa.from('products').update({stock:c.newStock,cost:c.newCost}).eq('id',c.p.id);if(up.error){toast('La entrada se guardó, pero hubo un problema actualizando stock');await syncFromRemote();return}}
    }
    rows.forEach(r=>state.entries.push(r)); changes.forEach(c=>{c.p.stock=c.newStock;c.p.cost=c.newCost});
    await persist();closeModal();render();toast(`Entrada registrada · ${rows.length} producto${rows.length===1?'':'s'}`);
  });
  setTimeout(()=>setupCart('entry',cart),0);
}

$$('[data-open-sale]').forEach(b=>b.onclick=()=>openSale());
function openSale(){
  if(!state.products.some(p=>Number(p.stock)>0))return toast('No hay productos con stock disponible');
  const cart=[];
  openForm('Nueva venta',field('Fecha','date','date',today(),'required')+field('Cliente','client','text','Consumidor final')+field('Cobrado ahora','paid','number',0,'min="0" step="0.01" required')+selectField('Medio de pago','method',[{value:'Efectivo',label:'Efectivo'},{value:'Transferencia',label:'Transferencia'},{value:'Cuenta corriente',label:'Cuenta corriente'},{value:'Otro',label:'Otro'}])+cartBuilderHtml('sale'),async e=>{
    e.preventDefault(); if(!cart.length)return toast('Agregá al menos un producto');
    const d=Object.fromEntries(new FormData(e.target));
    const requested=new Map();cart.forEach(x=>requested.set(x.product_id,(requested.get(x.product_id)||0)+Number(x.qty)));
    for(const [pid,q] of requested){const p=state.products.find(x=>x.id===pid);if(q>Number(p.stock))return toast(`Stock insuficiente de ${p.name}: quedan ${p.stock} unidades`)}
    const grandTotal=cart.reduce((a,x)=>a+Number(x.qty)*Number(x.unit_value),0),paid=Math.min(Number(d.paid||0),grandTotal),operationId=uid();
    const rows=cart.map((x,i)=>({id:uid(),operation_id:operationId,date:d.date,client:d.client||'Consumidor final',product_id:x.product_id,product_name:x.product_name,qty:Number(x.qty),unit_price:Number(x.unit_value),total:Number(x.qty)*Number(x.unit_value),paid:i===0?paid:0,method:d.method}));
    const changes=[...requested].map(([pid,q])=>{const p=state.products.find(x=>x.id===pid);const last=rows.filter(r=>r.product_id===pid).at(-1);return {p,newStock:Number(p.stock)-q,newPrice:Number(last.unit_price)}});
    if(remoteMode){
      const ins=await supa.from('sales').insert(rows);if(ins.error)return toast(ins.error.message);
      for(const c of changes){const up=await supa.from('products').update({stock:c.newStock,price:c.newPrice}).eq('id',c.p.id);if(up.error){toast('La venta se guardó, pero hubo un problema actualizando stock');await syncFromRemote();return}}
    }
    rows.forEach(r=>state.sales.push(r));changes.forEach(c=>{c.p.stock=c.newStock;c.p.price=c.newPrice});
    await persist();closeModal();render();toast(`Venta registrada · ${rows.length} producto${rows.length===1?'':'s'}`);
  });
  setTimeout(()=>setupCart('sale',cart),0);
}



function safeFileName(value){
  return String(value||'entrada').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
}
function findEntryGroup(id){return entryGroups().find(g=>g.id===id||g.items.some(x=>x.id===id))}
function findSaleGroup(id){return saleGroups().find(g=>g.id===id||g.items.some(x=>x.id===id))}

function itemPresentation(item){
  const p=state.products.find(x=>String(x.id)===String(item.product_id));
  return p?.presentation||'';
}
function addReportBrand(doc,subtitle){
  const logo=document.getElementById('reportLogo');
  if(logo?.complete&&logo.naturalWidth){
    try{doc.addImage(logo,'JPEG',67,9,76,34)}catch(e){console.warn('No se pudo insertar el logo',e)}
  }
  doc.setTextColor(35);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(subtitle,105,50,{align:'center'});
  doc.setDrawColor(225);doc.line(15,55,195,55);
  return 63;
}
function entryPdfName(group){return `entrada-${String(group.date||today())}-${safeFileName(group.id).slice(0,12)}.pdf`}
function buildEntryPdf(group){
  if(!window.jspdf?.jsPDF) throw new Error('No se pudo cargar el generador de PDF');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),left=15,right=195;
  let y=addReportBrand(doc,'Comprobante de entrada de mercadería');
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(35);
  doc.text(`Fecha: ${fmtDate(group.date)}`,left,y);doc.text(`Proveedor: ${String(group.supplier||'Sin proveedor').slice(0,80)}`,left,y+6);
  if(group.note)doc.text(`Nota: ${String(group.note).slice(0,100)}`,left,y+12);
  y+=group.note?23:17;
  doc.setFillColor(246,243,237);doc.rect(left,y-6,right-left,9,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.5);
  doc.text('Producto',left+2,y);doc.text('Presentación',77,y);doc.text('Cantidad',113,y);doc.text('Costo unit.',139,y);doc.text('Costo total',171,y);
  y+=8;doc.setFont('helvetica','normal');
  group.items.forEach(x=>{
    if(y>265){doc.addPage();y=20}
    doc.setTextColor(35);doc.setFontSize(8.5);
    doc.text(String(x.product_name||'').slice(0,31),left+2,y);
    doc.text(String(itemPresentation(x)||'—').slice(0,16),77,y);
    doc.text(String(x.qty),116,y);
    doc.text(money(x.unit_cost),136,y);
    doc.text(money(x.total),169,y);
    doc.setDrawColor(235);doc.line(left,y+4,right,y+4);y+=9;
  });
  y+=5;doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL',136,y);doc.text(money(group.total),169,y);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);doc.text('Generado desde el sistema de gestión',left,285);
  return doc;
}
window.downloadEntryPdf=id=>{const g=findEntryGroup(id);if(!g)return toast('No se encontró la entrada');try{buildEntryPdf(g).save(entryPdfName(g));toast('PDF generado')}catch(err){console.error(err);toast(err.message||'No se pudo generar el PDF')}};
window.shareEntryPdf=async id=>{
  const g=findEntryGroup(id);if(!g)return toast('No se encontró la entrada');
  try{
    const doc=buildEntryPdf(g),blob=doc.output('blob'),file=new File([blob],entryPdfName(g),{type:'application/pdf'});
    const detalle=g.items.map(x=>`${x.product_name} ${itemPresentation(x)?'('+itemPresentation(x)+')':''}: ${x.qty} × ${money(x.unit_cost)}`).join('\n');
    const text=`Entrada de mercadería\nFecha: ${fmtDate(g.date)}\nProveedor: ${g.supplier||'Sin proveedor'}\n${detalle}\nTotal: ${money(g.total)}`;
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:'Comprobante de entrada',text,files:[file]});return}
    doc.save(entryPdfName(g));toast('Tu navegador no permite compartir el PDF: se descargó el archivo');
  }catch(err){if(err?.name==='AbortError')return;console.error(err);toast(err.message||'No se pudo compartir el PDF')}
};

function salePdfName(group){return `venta-${String(group.date||today())}-${safeFileName(group.client||group.id).slice(0,20)}.pdf`}
function buildSalePdf(group){
  if(!window.jspdf?.jsPDF) throw new Error('No se pudo cargar el generador de PDF');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),left=15,right=195;
  const balance=Number(group.total||0)-Number(group.paid||0);
  let y=addReportBrand(doc,'Comprobante de venta');
  doc.setFont('helvetica','normal');doc.setTextColor(35);doc.setFontSize(10);doc.text(`Fecha: ${fmtDate(group.date)}`,left,y);doc.text(`Cliente: ${String(group.client||'Consumidor final').slice(0,80)}`,left,y+6);
  y+=16;
  doc.setFillColor(246,243,237);doc.rect(left,y-6,right-left,9,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);
  doc.text('Producto',left+2,y);doc.text('Cantidad',108,y);doc.text('Valor unit.',133,y);doc.text('Subtotal',168,y);
  y+=8;doc.setFont('helvetica','normal');
  group.items.forEach(x=>{
    if(y>250){doc.addPage();y=20}
    doc.setTextColor(35);doc.text(String(x.product_name||'').slice(0,46),left+2,y);doc.text(String(x.qty),112,y);doc.text(money(x.unit_price),133,y);doc.text(money(x.total),168,y);doc.setDrawColor(235);doc.line(left,y+4,right,y+4);y+=9;
  });
  y+=5;doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL',133,y);doc.text(money(group.total),168,y);
  y+=9;doc.setFontSize(10);doc.text('Cobrado',133,y);doc.text(money(group.paid||0),168,y);
  y+=7;doc.text('Saldo',133,y);doc.text(money(balance),168,y);
  if(group.method){y+=8;doc.setFont('helvetica','normal');doc.text(`Medio de pago: ${group.method}`,left,y)}
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);doc.text('Generado desde el sistema de stock',left,285);
  return doc;
}
window.downloadSalePdf=id=>{const g=findSaleGroup(id);if(!g)return toast('No se encontró la venta');try{buildSalePdf(g).save(salePdfName(g));toast('PDF generado')}catch(err){console.error(err);toast(err.message||'No se pudo generar el PDF')}};
window.shareSalePdf=async id=>{
  const g=findSaleGroup(id);if(!g)return toast('No se encontró la venta');
  try{
    const doc=buildSalePdf(g),blob=doc.output('blob'),file=new File([blob],salePdfName(g),{type:'application/pdf'});
    const detalle=g.items.map(x=>`${x.product_name}: ${x.qty} × ${money(x.unit_price)}`).join('\n');
    const saldo=Number(g.total||0)-Number(g.paid||0);
    const text=`Comprobante de venta\nFecha: ${fmtDate(g.date)}\nCliente: ${g.client||'Consumidor final'}\n${detalle}\nTotal: ${money(g.total)}\nCobrado: ${money(g.paid||0)}\nSaldo: ${money(saldo)}`;
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:'Comprobante de venta',text,files:[file]});return}
    doc.save(salePdfName(g));toast('Tu navegador no permite compartir el PDF: se descargó el archivo');
  }catch(err){if(err?.name==='AbortError')return;console.error(err);toast(err.message||'No se pudo compartir el PDF')}
};

window.deleteEntry=async id=>{
  const g=findEntryGroup(id);if(!g)return toast('No se encontró la entrada');
  const qtyByProduct=new Map();g.items.forEach(x=>qtyByProduct.set(x.product_id,(qtyByProduct.get(x.product_id)||0)+Number(x.qty||0)));
  for(const [pid,q] of qtyByProduct){const p=state.products.find(x=>x.id===pid);if(!p)return toast('No se encontró un producto de la entrada');if(Number(p.stock)<q)return toast(`No se puede eliminar: ${p.name} tiene ${p.stock} unidades y esta entrada agregó ${q}`)}
  const ok=window.confirm(`¿Está seguro que quiere borrar esta entrada?\n\n${g.items.length} producto(s) · Total ${money(g.total)}\n\nSe descontarán del stock todos los productos incluidos.`);if(!ok)return;
  const changes=[...qtyByProduct].map(([pid,q])=>{const p=state.products.find(x=>x.id===pid);return {p,oldStock:Number(p.stock),newStock:Number(p.stock)-q}});
  if(remoteMode){
    for(const c of changes){const up=await supa.from('products').update({stock:c.newStock}).eq('id',c.p.id);if(up.error)return toast('No se pudo ajustar el stock: '+up.error.message)}
    const q=g.legacy?supa.from('entries').delete().eq('id',g.items[0].id):supa.from('entries').delete().eq('operation_id',g.id);const del=await q;
    if(del.error){for(const c of changes)await supa.from('products').update({stock:c.oldStock}).eq('id',c.p.id);return toast('No se pudo eliminar la entrada: '+del.error.message)}
  }
  changes.forEach(c=>c.p.stock=c.newStock);const ids=new Set(g.items.map(x=>x.id));state.entries=state.entries.filter(x=>!ids.has(x.id));await persist();render();toast('Entrada eliminada y stock ajustado');
};

window.deleteSale=async id=>{
  const g=findSaleGroup(id);if(!g)return toast('No se encontró la venta');
  const ok=window.confirm(`¿Está seguro que quiere borrar esta venta?\n\n${g.items.length} producto(s) · Total ${money(g.total)}\n\nEl stock de todos los productos volverá hacia atrás.`);if(!ok)return;
  const qtyByProduct=new Map();g.items.forEach(x=>qtyByProduct.set(x.product_id,(qtyByProduct.get(x.product_id)||0)+Number(x.qty||0)));
  const changes=[];
  for(const [pid,q] of qtyByProduct){const p=state.products.find(x=>x.id===pid);if(!p)return toast('No se encontró un producto asociado a la venta');changes.push({p,oldStock:Number(p.stock),newStock:Number(p.stock)+q})}
  if(remoteMode){
    for(const c of changes){const up=await supa.from('products').update({stock:c.newStock}).eq('id',c.p.id);if(up.error)return toast('No se pudo reponer el stock: '+up.error.message)}
    const q=g.legacy?supa.from('sales').delete().eq('id',g.items[0].id):supa.from('sales').delete().eq('operation_id',g.id);const del=await q;
    if(del.error){for(const c of changes)await supa.from('products').update({stock:c.oldStock}).eq('id',c.p.id);return toast('No se pudo eliminar la venta: '+del.error.message)}
  }
  changes.forEach(c=>c.p.stock=c.newStock);const ids=new Set(g.items.map(x=>x.id));state.sales=state.sales.filter(x=>!ids.has(x.id));await persist();render();toast('Venta eliminada y stock repuesto');
};

$('#newPaymentBtn').onclick=()=>openForm('Registrar pago',field('Fecha','date','date',today(),'required')+field('Cliente','client','text','','required')+field('Importe','amount','number',0,'min="0.01" step="0.01" required')+selectField('Medio de pago','method',[{value:'Efectivo',label:'Efectivo'},{value:'Transferencia',label:'Transferencia'},{value:'Otro',label:'Otro'}])+field('Nota','note','text','','','full'),async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const x={id:uid(),date:d.date,client:d.client,amount:Number(d.amount),method:d.method,note:d.note||''};if(remoteMode){const ins=await supa.from('payments').insert(x);if(ins.error)return toast(ins.error.message)}state.payments.push(x);await persist();closeModal();render();toast('Cobranza registrada')});


async function uploadSupplierReceipt(file,paymentId){
  if(!remoteMode)throw new Error('Los comprobantes requieren Supabase');
  if(!file||!file.size)return null;
  if(file.size>8*1024*1024)throw new Error('El comprobante no puede superar 8 MB');
  const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))throw new Error('Usá PDF, JPG, PNG o WEBP');
  const {data:{user}}=await supa.auth.getUser();
  const ext=(file.name.split('.').pop()||'bin').toLowerCase();
  const path=`${user?.id||'user'}/${paymentId}-${Date.now()}.${ext}`;
  const up=await supa.storage.from('supplier-payment-receipts').upload(path,file,{upsert:false,contentType:file.type});
  if(up.error)throw up.error;
  return path;
}

$('#newSupplierPaymentBtn').onclick=()=>{
  const names=supplierNames();
  if(!names.length)return toast('Primero cargá una entrada indicando el proveedor');
  const opts=names.map(x=>({value:x,label:x}));
  openForm('Registrar pago a proveedor',field('Fecha','date','date',today(),'required')+selectField('Proveedor','supplier',opts)+field('Importe','amount','number',0,'min="0.01" step="0.01" required')+selectField('Medio de pago','method',[{value:'Efectivo',label:'Efectivo'},{value:'Transferencia',label:'Transferencia'},{value:'Otro',label:'Otro'}])+field('Nota','note','text','','','full')+'<div class="field full"><label>Comprobante (opcional)</label><input class="input" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><small class="field-help">PDF o imagen, hasta 8 MB.</small></div>',async e=>{
    e.preventDefault();
    const fd=new FormData(e.target),id=uid(),file=fd.get('receipt');
    const x={id,date:fd.get('date'),supplier:String(fd.get('supplier')||''),amount:Number(fd.get('amount')||0),method:String(fd.get('method')||''),note:String(fd.get('note')||''),receipt_path:null};
    if(x.amount<=0)return toast('Ingresá un importe válido');
    try{
      if(file instanceof File && file.size)x.receipt_path=await uploadSupplierReceipt(file,id);
      if(remoteMode){const ins=await supa.from('supplier_payments').insert(x);if(ins.error){if(x.receipt_path)await supa.storage.from('supplier-payment-receipts').remove([x.receipt_path]);return toast(ins.error.message)}}
      (state.supplierPayments||(state.supplierPayments=[])).push(x);await persist();closeModal();render();toast('Pago a proveedor registrado');
    }catch(err){console.error(err);toast(err.message||'No se pudo registrar el pago')}
  });
};

window.openSupplierReceipt=async id=>{
  const x=(state.supplierPayments||[]).find(p=>p.id===id);if(!x?.receipt_path)return toast('Este pago no tiene comprobante');
  try{const {data,error}=await supa.storage.from('supplier-payment-receipts').createSignedUrl(x.receipt_path,120);if(error)throw error;window.open(data.signedUrl,'_blank','noopener')}catch(err){console.error(err);toast('No se pudo abrir el comprobante')}
};
window.attachSupplierReceipt=id=>{
  if(!remoteMode)return toast('Los comprobantes requieren Supabase');
  const input=document.createElement('input');input.type='file';input.accept='application/pdf,image/jpeg,image/png,image/webp';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const x=(state.supplierPayments||[]).find(p=>p.id===id);if(!x)return;try{const path=await uploadSupplierReceipt(file,id);const up=await supa.from('supplier_payments').update({receipt_path:path}).eq('id',id);if(up.error){await supa.storage.from('supplier-payment-receipts').remove([path]);throw up.error}x.receipt_path=path;render();toast('Comprobante adjuntado')}catch(err){console.error(err);toast(err.message||'No se pudo adjuntar el comprobante')}};input.click();
};
window.deleteSupplierPayment=async id=>{
  const x=(state.supplierPayments||[]).find(p=>p.id===id);if(!x)return;
  if(!window.confirm(`¿Está seguro que quiere borrar este pago?\n\n${x.supplier} · ${money(x.amount)}`))return;
  if(remoteMode){const del=await supa.from('supplier_payments').delete().eq('id',id);if(del.error)return toast(del.error.message);if(x.receipt_path)await supa.storage.from('supplier-payment-receipts').remove([x.receipt_path])}
  state.supplierPayments=state.supplierPayments.filter(p=>p.id!==id);await persist();render();toast('Pago a proveedor eliminado');
};

$('#backupBtn').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`miel-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Copia exportada')};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2400)}

(async()=>{await initStorage();showView('dashboard');render();startAutoSync()})();
