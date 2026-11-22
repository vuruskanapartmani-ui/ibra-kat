/* IBRAKAT bank review V1.29: read all periods; controlled bulk reconciliation. */
(function(){
  "use strict";
  const PAGE_SIZE=100;
  let page=0;
  const f={bank:"all",direction:"all",status:"pending",q:""};
  const enc=v=>esc(String(v==null?"":v));
  const month=tx=>{
    const p=state.periods.find(x=>x.id===tx.periodId);
    return p?.month||String(tx.date||"").slice(0,7)||"—";
  };
  const isPending=tx=>{
    const amount=Number(tx.amount||0);
    return amount>0?txAllocated(tx.id)+0.005<amount:amount<0&&!tx.expenseId;
  };
  const isSafeIncome=tx=>Number(tx.amount)>0 && isPending(tx) && txAllocated(tx.id)<0.005 &&
    tx.matchConfidence==="high" && (tx.suggestedUnitIds||[]).length===1 &&
    !!unit(tx.suggestedUnitIds[0]);
  const list=()=>state.bankTransactions.filter(tx=>{
    if(f.bank!=="all"&&tx.bankId!==f.bank)return false;
    if(f.direction==="income"&&Number(tx.amount)<=0)return false;
    if(f.direction==="expense"&&Number(tx.amount)>=0)return false;
    if(f.status==="pending"&&!isPending(tx))return false;
    if(f.status==="processed"&&isPending(tx))return false;
    const q=normTR(f.q);
    if(q&&!normTR([tx.date,tx.description,tx.reference,bankProfile(tx.bankId).name,month(tx),
      (tx.suggestedUnitIds||[]).map(id=>unit(id)?.label||"").join(" ")].join(" ")).includes(q))return false;
    return true;
  }).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||String(a.id).localeCompare(String(b.id)));
  function statLabel(tx){
    if(!isPending(tx))return '<span class="pill ok">İşlenmiş</span>';
    if(isSafeIncome(tx))return '<span class="pill ok">Güçlü öneri</span>';
    if(Number(tx.amount)>0)return '<span class="pill warn">Elle eşleştir</span>';
    return '<span class="pill warn">Gider kontrolü</span>';
  }
  function bankReviewView(){
    const items=list(),totalPages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
    page=Math.min(page,totalPages-1);
    const displayed=items.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    const pending=(state.bankTransactions||[]).filter(isPending);
    const safe=pending.filter(isSafeIncome).length;
    const pendingOut=pending.filter(x=>Number(x.amount)<0).length;
    const rows=displayed.map(tx=>{
      const income=Number(tx.amount)>0;
      const suggested=(tx.suggestedUnitIds||[]).map(id=>unit(id)?.label).filter(Boolean).join(", ");
      const eligible=isPending(tx)&&(isSafeIncome(tx)||!income);
      const id=enc(tx.id);
      const category=!income&&eligible?'<select class="br-category" id="bankCat_'+id+'" aria-label="Gider kategorisi">'+expenseCategoryOptions(suggestExpenseCategory(tx.description))+'</select>':'';
      return '<tr class="'+(isPending(tx)?"br-pending":"")+'">'+
        '<td><input type="checkbox" class="bank-bulk-check" data-tx="'+id+'" aria-label="Hareketi seç" '+(eligible?'onchange="updateBulkBankBar()"':'disabled')+'></td>'+
        '<td class="br-nowrap">'+enc(tx.date||"—")+'</td>'+
        '<td class="br-nowrap">'+enc(month(tx))+'</td>'+
        '<td>'+enc(bankProfile(tx.bankId).name)+'</td>'+
        '<td class="br-description" title="'+enc(tx.description||"")+'">'+enc(tx.description||"—")+'<div class="small muted">'+enc(tx.reference||"")+'</div></td>'+
        '<td class="br-amount '+(income?"ok":"danger")+'">'+trMoney(tx.amount)+'</td>'+
        '<td>'+statLabel(tx)+'</td>'+
        '<td class="br-assignment">'+(income?(suggested?enc(suggested):'<span class="muted">Öneri yok</span>')+(tx.matchConfidence?"<div class='small muted'>"+enc(matchConfidenceLabel(tx.matchConfidence))+"</div>":""):category)+'</td>'+
        '<td class="br-nowrap">'+(isPending(tx)?income?
        '<button class="br-small-btn" onclick="openBankAllocation(\''+id+'\')">Dağıt</button>':
        '<button class="br-small-btn" onclick="openBankExpense(\''+id+'\')">Gider aç</button>':
        '<span class="small muted">Tamam</span>')+'</td></tr>';
    }).join("");
    const html='<section class="br-page">'+
      '<div class="sectionHead"><div><h2>Tüm Banka Hareketleri</h2><div class="muted small">Tüm dönemler · İş Bankası + Ziraat · Dönem seçmeye gerek yok</div></div><button onclick="go(\'accounting\')">Ön Muhasebe</button></div>'+
      '<div class="br-kpis"><div class="card"><span>Kontrol bekleyen</span><b>'+pending.length+'</b></div><div class="card"><span>Güçlü tek daire önerisi</span><b>'+safe+'</b></div><div class="card"><span>Gider eşleşmesi bekleyen</span><b>'+pendingOut+'</b></div><div class="card"><span>Toplam hareket</span><b>'+state.bankTransactions.length+'</b></div></div>'+
      '<div class="card br-filters"><label>Durum<select id="brStatus" onchange="bankReviewSet(\'status\',this.value)"><option value="pending" '+(f.status==="pending"?"selected":"")+'>Bekleyenler</option><option value="processed" '+(f.status==="processed"?"selected":"")+'>İşlenmiş</option><option value="all" '+(f.status==="all"?"selected":"")+'>Tümü</option></select></label>'+
      '<label>Banka<select onchange="bankReviewSet(\'bank\',this.value)"><option value="all">Tüm bankalar</option>'+Object.values(BANK_PROFILES).map(b=>'<option value="'+enc(b.id)+'" '+(f.bank===b.id?"selected":"")+'>'+enc(b.name)+'</option>').join("")+'</select></label>'+
      '<label>İşlem<select onchange="bankReviewSet(\'direction\',this.value)"><option value="all">Giriş + çıkış</option><option value="income" '+(f.direction==="income"?"selected":"")+'>Giriş</option><option value="expense" '+(f.direction==="expense"?"selected":"")+'>Çıkış</option></select></label>'+
      '<label>Ara<input id="brSearch" value="'+enc(f.q)+'" placeholder="Tarih, dönem, açıklama, daire" oninput="bankReviewSearch(this.value)"></label></div>'+
      '<div class="card br-toolbar"><div><b>'+items.length+' kayıt · Sayfa '+(page+1)+'/'+totalPages+'</b><div id="bulkBankCount" class="small muted">0 hareket seçili</div></div>'+
      '<div class="br-buttons"><button onclick="bankReviewSelectSafe()">Güçlü eşleşmeleri seç (bu sayfa)</button><button onclick="selectAllEligibleBankRows(false)">Temizle</button><button class="primary" onclick="bankReviewPreview()">Seçimi önizle ve işle</button></div></div>'+
      '<div class="notice" style="margin:10px 0">Toplu işlem yalnızca kontrol ederek yapılır. <b>Güçlü eşleşmeleri seç</b> sadece tek daireye yüksek güvenle eşleşen gelirleri seçer. Giderleri tek tek seçebilir, kategorilerini değiştirebilirsin. Belirsiz gelirler elle dağıtılır. <b>Seçim sadece bu sayfada geçerlidir.</b></div>'+
      '<div class="tableWrap br-table-wrap"><table class="br-table"><thead><tr><th>Seç</th><th>Tarih</th><th>Dönem</th><th>Banka</th><th>Açıklama / Referans</th><th>Tutar</th><th>Durum</th><th>Daire / Gider türü</th><th>İşlem</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="9">Bu filtrede hareket yok.</td></tr>')+'</tbody></table></div>'+
      '<div class="br-pager"><button onclick="bankReviewPage(-1)" '+(page===0?"disabled":"")+'>Önceki 100</button><b>'+(page+1)+' / '+totalPages+'</b><button onclick="bankReviewPage(1)" '+(page+1>=totalPages?"disabled":"")+'>Sonraki 100</button></div>'+
      '</section>';
    return shell(html,adminMainNav());
  }
  window.bankReviewSet=function(k,v){if(!Object.prototype.hasOwnProperty.call(f,k))return;f[k]=v;page=0;render()};
  window.bankReviewSearch=function(v){f.q=v;page=0;const input=document.activeElement;const start=input?.selectionStart;render();const next=document.getElementById("brSearch");if(next){next.focus();if(start!=null)next.setSelectionRange(start,start)}};
  window.bankReviewPage=function(delta){page=Math.max(0,page+delta);render();window.scrollTo({top:0})};
  window.bankReviewSelectSafe=function(){
    document.querySelectorAll(".bank-bulk-check").forEach(el=>{
      const tx=state.bankTransactions.find(x=>x.id===el.dataset.tx);
      el.checked=!!tx&&isSafeIncome(tx);
    });updateBulkBankBar();
  };
  window.bankReviewPreview=function(){
    const checked=Array.from(document.querySelectorAll(".bank-bulk-check:checked"));
    if(!checked.length){notify("Önce hareket seç.");return;}
    const selected=checked.map(el=>{const tx=state.bankTransactions.find(t=>t.id===el.dataset.tx);
      const c=document.getElementById("bankCat_"+el.dataset.tx);
      return {id:el.dataset.tx,amount:Number(tx?.amount||0),desc:tx?.description||"",type:Number(tx?.amount||0)>0?"income":"expense",category:c?.value||""};
    });
    const valid=selected.every(x=>{const tx=state.bankTransactions.find(t=>t.id===x.id);return !!tx&&isPending(tx)&&(x.type==="expense"?!tx.expenseId:isSafeIncome(tx))});
    if(!valid){notify("Seçimde işlenmiş veya belirsiz hareket var; listeyi yenile.");render();return;}
    const inc=selected.filter(x=>x.type==="income"),out=selected.filter(x=>x.type==="expense");
    const sum=a=>a.reduce((n,x)=>n+Math.abs(x.amount),0);
    const sample=selected.slice(0,15).map(x=>'<tr><td>'+enc(x.type==="income"?"Gelir":"Gider")+'</td><td class="br-description">'+enc(x.desc)+'</td><td>'+enc(x.category||state.bankTransactions.find(t=>t.id===x.id)?.suggestedUnitIds?.map(id=>unit(id)?.label).join(", ")||"—")+'</td><td class="br-amount">'+trMoney(x.amount)+'</td></tr>').join("");
    window.__bankReviewSelection=selected;
    openModal('<h2>Toplu İşlem Önizlemesi</h2><div class="notice warn" style="margin:10px 0"><b>Bu işlem muhasebe kayıtları oluşturur.</b> Yalnızca doğruladığın hareketleri kaydet. Gelirler açık borçlara dağıtılır; artan tutar avans olarak kaydedilebilir. Giderler seçilen kategoriyle gider kaydına dönüştürülür.</div>'+
      '<div class="br-kpis"><div class="card"><span>Gelir</span><b>'+inc.length+'</b><small>'+trMoney(sum(inc))+'</small></div><div class="card"><span>Gider</span><b>'+out.length+'</b><small>'+trMoney(sum(out))+'</small></div></div>'+
      '<div class="tableWrap"><table class="br-table"><thead><tr><th>Tür</th><th>Açıklama</th><th>Daire / kategori</th><th>Tutar</th></tr></thead><tbody>'+sample+'</tbody></table></div>'+
      (selected.length>15?'<div class="small muted">İlk 15 kayıt gösteriliyor; toplam '+selected.length+' kayıt işlenecek.</div>':'')+
      '<div class="actions" style="margin-top:14px"><button onclick="closeModal()">Vazgeç</button><button class="primary" onclick="bankReviewCommit()">Onayla ve '+selected.length+' kaydı işle</button></div>');
  };
  window.bankReviewCommit=function(){
    const selection=window.__bankReviewSelection||[];
    if(!selection.length){notify("Seçim bulunamadı.");return;}
    const valid=selection.every(x=>{const tx=state.bankTransactions.find(t=>t.id===x.id);return tx&&isPending(tx)&&(x.type==="expense"?Number(tx.amount)<0&&!tx.expenseId:isSafeIncome(tx))});
    if(!valid){window.__bankReviewSelection=null;closeModal();render();notify("Hareketlerin durumu değişmiş, yeniden seç.");return;}
    let incomes=0,expenses=0;for(const x of selection){
      const tx=state.bankTransactions.find(t=>t.id===x.id);
      if(x.type==="income"){if(bulkAutoAllocateIncome(tx))incomes++;}
      else{
        const e={id:uid("exp"),periodId:periodIdForDate(tx.date),date:tx.date,category:x.category||suggestExpenseCategory(tx.description),description:tx.description,amount:Math.abs(Number(tx.amount)),paid:true,paymentMethod:"Banka",fileName:null,bankTransactionId:tx.id,bankId:tx.bankId,bankName:bankProfile(tx.bankId).name};
        state.expenses.push(e);tx.expenseId=e.id;expenses++;
      }
    }
    window.__bankReviewSelection=null;
    saveState();logAudit("Toplu banka eşleştirme","Tahsilat "+incomes+" · Gider "+expenses);
    closeModal();render();notify(incomes+" tahsilat ve "+expenses+" gider işlendi.");
  };
  const priorRender=render;
  render=function(){
    if(session?.role==="manager"&&route==="bankReview"){
      const app=document.getElementById("app");if(app)app.innerHTML=bankReviewView();
      return;
    }
    return priorRender();
  };
  const priorHome=managerHome;
  managerHome=function(){
    return priorHome().replace(/(<b>\d+ banka hareketi kontrol bekliyor\.<\/b>)/,
      '$1 <button class="br-open-btn" onclick="go(\'bankReview\')">Tüm hareketleri gör ve topluca işle</button>');
  };
  const priorHub=adminFinanceHub;
  adminFinanceHub=function(){
    return priorHub().replace('onclick="go(\'accounting\')"','onclick="go(\'bankReview\')"').replace(
    "<h3>Ön Muhasebe</h3>","<h3>Tüm Banka Hareketleri</h3>").replace(
    "Banka hareketleri, gider/fatura ve eşleştirmeler","444 dahil tüm dönemlerdeki banka hareketleri ve toplu işlem");
  };
  const oldProcess=processSelectedBankTransactions;
  processSelectedBankTransactions=function(){bankReviewPreview()};
  // Keep the existing user confirmation semantics; do not silently auto-process anything.
  window.processSelectedBankTransactions=processSelectedBankTransactions;
  const originalSelect=selectAllEligibleBankRows;
  selectAllEligibleBankRows=function(on){if(!on)return originalSelect(false);return bankReviewSelectSafe()};
  window.selectAllEligibleBankRows=selectAllEligibleBankRows;
  render();
})();