import {neon} from '@neondatabase/serverless';

export type JobRow={id:number;owner_key:string;request:Record<string,any>;state:Record<string,any>;status:string;created_at:string;cancelled_at:string|null;legacy_issue_url?:string};
export class NeonJobs {
 private sql:ReturnType<typeof neon>;
 constructor(url:string){this.sql=neon(url);}
 private async expire(){await this.sql.query('SELECT patchgoblin_expire()');}
 async list(owner:string):Promise<JobRow[]>{await this.expire();return await this.sql.query('SELECT * FROM patchgoblin_jobs WHERE owner_key=$1 ORDER BY created_at DESC LIMIT 100',[owner]) as JobRow[];}
 async get(id:number,owner:string):Promise<JobRow|undefined>{await this.expire();const rows=await this.sql.query('SELECT * FROM patchgoblin_jobs WHERE id=$1 AND owner_key=$2',[id,owner]) as JobRow[];return rows[0];}
 async create(owner:string,key:string,request:Record<string,any>):Promise<JobRow>{
  const rows=await this.sql.query('SELECT * FROM patchgoblin_enqueue($1,$2,$3::jsonb)',[owner,key,JSON.stringify(request)]) as JobRow[];return rows[0];
 }
 async cancel(id:number,owner:string):Promise<void>{await this.sql.query("UPDATE patchgoblin_jobs SET cancelled_at=now(),status=CASE WHEN status='submitted' THEN status ELSE 'cancelled' END,updated_at=now() WHERE id=$1 AND owner_key=$2",[id,owner]);}
 async submitted(id:number,owner:string,pr:Record<string,any>):Promise<void>{await this.sql.query("UPDATE patchgoblin_jobs SET state=state || $3::jsonb,status='submitted',updated_at=now() WHERE id=$1 AND owner_key=$2 AND status IN ('verified','submitted')",[id,owner,JSON.stringify(pr)]);}
 issue(row:JobRow,login:string):Record<string,any>{return {number:Number(row.id),title:'PatchGoblin job '+row.request.mode,body:JSON.stringify(row.request),user:{login},state:row.cancelled_at?'closed':'open',created_at:row.created_at,html_url:row.legacy_issue_url||null,database_state:{...row.state,status:row.status}};}
}
