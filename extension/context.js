export const BACKEND='https://patchgoblin.vercel.app';
export function recognize(value){
 try{
  const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='github.com')return null;
  const parts=url.pathname.split('/').filter(Boolean);if(parts.length<2||['settings','organizations','orgs','apps','marketplace','login','features','topics','search'].includes(parts[0]))return null;
  if(!parts.slice(0,2).every(x=>/^[\w.-]+$/.test(x)))return null;
  const run=parts[2]==='actions'&&parts[3]==='runs'&&/^\d+$/.test(parts[4]||'')?parts[4]:null;
  return {repo:parts.slice(0,2).join('/'),run};
 }catch{return null;}
}
export function actionUrl(context,mode){const url=new URL('/workbench',BACKEND);if(context?.repo)url.searchParams.set('repo',context.repo);if(mode)url.searchParams.set('mode',mode);if(mode==='repair'&&context?.run)url.searchParams.set('run',context.run);return url.toString();}
