// Aliases describe product identity, never a loose similarity or a numeric token match.
export function canonicalProductText(value){
 return String(value||'').replace(/\b(?:play\s*station|play|ps)\s*[-–]?\s*([1-5])\b/gi,(_,generation)=>`PlayStation ${generation}`);
}
const plain=value=>canonicalProductText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const objectHead=value=>plain(value).replace(/^[^a-z0-9]+/,'').replace(/^(?:(?:busco|quiero|necesito|comprar|compro|vendo|venta|se vende|un|una|el|la|los|las|pack|lote|set|de|[0-9]+)\s+)*/,'');
const accessoryHead=/^(?:juegos?|videojuegos?|mandos?|controladores?|dualsense|dualshock|fundas?|cajas?|cargadores?|cables?|soportes?|volantes?|auriculares?|cascos|gafas|adaptadores?|accesorios?|piezas?|carcasas?|pegatinas?|repuestos?|ventiladores?|lectores?|discos?|placas?|reparacion|servicio)\b/;
function generations(value){return [...plain(value).matchAll(/\bplaystation\s+([1-5])\b/g)].map(m=>m[1]);}
export function productIdentity(request,plan){
 const canonicalRequest=canonicalProductText(request);
 // Negated alternatives cannot become the requested generation.
 const positive=plain(request).split(/\b(?:sin|excepto|no quiero|no busco|pero no)\b/)[0];
 const targets=[...new Set(generations(positive))];
 const head=objectHead(positive);
 const consoleRequested=targets.length===1&&!accessoryHead.test(head)&&(/\bconsola\b/.test(positive)||/^(?:sony\s+)?playstation\s+[1-5](?!\s+(?:juegos?|mandos?|accesorios?)\b)/.test(head));
 return {request:canonicalRequest,product:canonicalProductText(plan?.product||request),consoleGeneration:consoleRequested?targets[0]:null};
}
function rejected(category,reason){return {id:1,accept:false,score:0,category,reason,source:'identity_rule'};}
export function identityRejection(identity,listing){
 const wanted=identity.consoleGeneration;
 if(!wanted)return null;
 const title=objectHead(listing.title),spec=plain(listing.spec),description=plain(listing.description);
 if(accessoryHead.test(title))return rejected('accessory',`El anuncio vende un juego, accesorio o servicio; se busca una consola PlayStation ${wanted}.`);
 if(/\b(?:no (?:se )?(?:incluye|incluida|incluido|vendo)|sin)\s+(?:la\s+)?(?:consola|playstation\s+[1-5])\b/.test(description))return rejected('missing_requirement','El anuncio indica que no incluye la consola solicitada.');
 const primary=title.match(/^(?:(?:consola|sony)\s+)*playstation\s+([1-5])\b/);
 if(primary&&primary[1]!==wanted)return rejected('wrong_model',`El anuncio vende una PlayStation ${primary[1]}; se busca PlayStation ${wanted}.`);
 if(/^(?:(?:consola|nueva)\s+)*(?:nintendo|xbox|sega|steam deck|ps vita|playstation vita)\b/.test(title))return rejected('wrong_model',`El anuncio vende otra consola; se busca PlayStation ${wanted}.`);
 const advertised=generations(`${listing.title||''} ${spec}`);
 if(advertised.length&&!advertised.includes(wanted))return rejected('wrong_model',`El modelo anunciado no es PlayStation ${wanted}.`);
 // A generic Sony console is not evidence of the requested generation. Do not infer it.
 const positiveDescription=description.replace(/\b(?:no (?:es|incluye|vendo)|sin)\s+(?:una?\s+)?playstation\s+[1-5]\b/g,'');
 if(!advertised.includes(wanted)&&!generations(positiveDescription).includes(wanted))return rejected('missing_requirement',`No se confirma que el anuncio incluya una consola PlayStation ${wanted}.`);
 return null;
}
