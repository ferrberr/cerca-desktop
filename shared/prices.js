export function priceRange(input={}){
 const minPrice=input.minPrice??0,maxPrice=input.maxPrice??Infinity;
 if(!Number.isFinite(minPrice)||minPrice<0||minPrice>1e8)throw new Error('El precio mínimo debe ser un número entre 0 y 100.000.000 €.');
 if(maxPrice!==Infinity&&(!Number.isFinite(maxPrice)||maxPrice<0||maxPrice>1e8))throw new Error('El precio máximo debe ser un número entre 0 y 100.000.000 €.');
 if(minPrice>maxPrice)throw new Error('El precio mínimo no puede superar el precio máximo.');
 return {minPrice,maxPrice};
}
