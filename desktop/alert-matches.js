export async function notifyNewMatches(alert,items,store,notify){
 const key=String(alert.id),seen=new Set(store.data.notified[key]||[]);
 const unique=new Map(items.filter(p=>!p.demo&&p.available!==false&&!p.reserved).map(p=>[`${p.id}:${p.price}`,p]));
 const fresh=[...unique].filter(([signature])=>!seen.has(signature));
 if(!fresh.length)return 0;
 await notify('Cerca · Una oportunidad para ti',`${fresh.length} coincidencia${fresh.length===1?'':'s'} para ${alert.query}. Desde ${Math.min(...fresh.map(([,p])=>p.price))} €.`);
 store.data.notified[key]=[...seen,...fresh.map(([signature])=>signature)].slice(-2000);store.flush();
 return fresh.length;
}
