// Aliases describe product identity, never a loose similarity or a numeric token match.
export function canonicalProductText(value){
 return String(value||'').replace(/\b(?:play\s*station|play|ps)\s*[-–]?\s*([1-5])\b/gi,(_,generation)=>`PlayStation ${generation}`);
}
