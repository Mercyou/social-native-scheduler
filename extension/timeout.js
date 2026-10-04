export async function withTimeout(promise, milliseconds=15000) {
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('网页操作超时，已停止。请检查平台编辑器和待发布列表；不要直接重复提交。')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
