export class AsyncQueue {
 constructor(onClose=()=>{}){this.values=[];this.waiters=[];this.closed=false;this.error=null;this.onClose=onClose;}
 push(value){if(this.closed)return;const waiter=this.waiters.shift();if(waiter)waiter.resolve({value,done:false});else this.values.push(value);}
 finish(error){if(this.closed)return;this.closed=true;this.error=error;if(error)this.values=[];for(const waiter of this.waiters.splice(0))error?waiter.reject(error):waiter.resolve({done:true});}
 next(){if(this.values.length)return Promise.resolve({value:this.values.shift(),done:false});if(this.error)return Promise.reject(this.error);if(this.closed)return Promise.resolve({done:true});return new Promise((resolve,reject)=>this.waiters.push({resolve,reject}));}
 async return(){this.onClose();this.values=[];this.finish();return{done:true};}
 [Symbol.asyncIterator](){return this;}
}
