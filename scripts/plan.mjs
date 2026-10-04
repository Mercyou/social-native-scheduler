import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function plan(input){
 const {texts,platforms,start,intervalMinutes}=input;
 if(!Array.isArray(texts)||!texts.length||texts.some(t=>typeof t!=='string'||!t.trim()))throw new Error('texts must contain nonempty strings');
 if(new Set(texts.map(t=>t.trim())).size!==texts.length)throw new Error('duplicate text');
 if(!Array.isArray(platforms)||!platforms.length||new Set(platforms).size!==platforms.length||platforms.some(p=>!['x','weibo'].includes(p)))throw new Error('platforms must be unique x/weibo values');
 if(typeof start!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(start)||!Number.isFinite(Date.parse(start)))throw new Error('start requires explicit timezone');
 if(!Number.isFinite(intervalMinutes)||intervalMinutes<=0)throw new Error('intervalMinutes must be positive');
 const offset=start.endsWith('Z')?0:(start.at(-6)==='-'?-1:1)*(Number(start.slice(-5,-3))*60+Number(start.slice(-2)));
 return texts.flatMap((text,index)=>{
  const utc=Date.parse(start)+index*intervalMinutes*60000;
  const local=new Date(utc+offset*60000).toISOString().slice(0,19)+start.slice(start.endsWith('Z')?-1:-6);
  return platforms.map(platform=>({sequence:index+1,platform,text,at:local,status:'planned'}));
 });
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 if(process.argv.length!==4)throw new Error('Usage: node plan.mjs input.json output.json');
 const jobs=plan(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 fs.writeFileSync(process.argv[3],JSON.stringify({jobs},null,2),{flag:'wx'});
 console.log(`Prepared ${jobs.length} planned entries. No posts submitted.`);
}
