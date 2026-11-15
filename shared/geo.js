export const DEFAULT_CENTER = Object.freeze({latitude:41.3851, longitude:2.1734, label:'Barcelona'});
export function validCoordinates(latitude,longitude){return Number.isFinite(latitude)&&Math.abs(latitude)<=90&&Number.isFinite(longitude)&&Math.abs(longitude)<=180;}
export function distanceKm(a,b){
 if(!a||!b||!validCoordinates(a.latitude,a.longitude)||!validCoordinates(b.latitude,b.longitude))return null;
 const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
 const v=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
export function listingDistance(center,item){
 const geographic=distanceKm(center,item);if(geographic!==null)return geographic;
 const origin=item.distanceCenter||DEFAULT_CENTER;
 return distanceKm(center,origin)<0.1&&Number.isFinite(item.distance)?item.distance:null;
}
export function withinArea(item,{center=DEFAULT_CENTER,radius=50,zone}={}){
 if(zone==='Todas las zonas')return true;
 const distance=listingDistance(center,item);
 return distance!==null&&distance<=radius;
}
