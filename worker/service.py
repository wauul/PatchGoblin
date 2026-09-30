"""Authenticated HTTP wake-up service. Neon is the durable queue; no idle polling."""
import hmac
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from worker.agent import Agent
from worker.database import DatabaseStore, claim, connect
from worker.github import GitHub
from worker.railway_sandbox import RailwaySandbox, destroy
from worker.security import redact
from worker.submit import submit

DRAIN_LOCK=threading.Lock()


def cleanup():
    with connect() as db:
        rows=db.execute('SELECT id,sandbox_id FROM patchgoblin_jobs WHERE sandbox_id IS NOT NULL AND (lease_expires_at IS NULL OR lease_expires_at<now())').fetchall()
    for row in rows:
        try:
            destroy(row['sandbox_id'])
        except Exception:
            # Expired/auto-destroyed VMs are harmless. Keep the ID for inspection.
            continue
        with connect() as db:
            db.execute('UPDATE patchgoblin_jobs SET sandbox_id=NULL WHERE id=%s AND sandbox_id=%s',(row['id'],row['sandbox_id']))


def execute(row):
    store=DatabaseStore(row)
    github=GitHub()
    agent=Agent(github,store)
    agent.sandbox_factory=lambda root,cancelled,deadline:RailwaySandbox(root,cancelled,deadline,
        {'repo':agent.state['repo'],'sha':agent.state['sha']},store.sandbox)
    try:
        request=row['request']
        if not isinstance(request,dict) or set(request)-{'repo','mode','run_id','ref','owner','key','created_at','ci_logs'}:
            raise ValueError('Invalid durable job request')
        if request.get('owner')!=row['owner_key']:
            raise ValueError('Durable job owner mismatch')
        result=agent.execute(request)
        if result['status']=='verified' and not store.cancelled(force=True):
            try:
                result.update(submit(github,row['id'],request,result,lambda:store.cancelled(force=True)))
            except Exception as exc:
                result['pr_error']=redact(str(exc))[:1000]
            store.save(result)
        print(json.dumps({'job':row['id'],'status':result['status'],'metrics':result.get('metrics',{})}),flush=True)
    except Exception as exc:
        if not store.cancelled(force=True):
            agent.state.update(status='failed',diagnosis=redact(str(exc))[:1000])
            store.save(agent.state)
        print(json.dumps({'job':row['id'],'error':redact(str(exc))[:1000]}),flush=True)
    finally:
        github.client.close()
        store.release()


def drain():
    try:
        cleanup()
        while row:=claim():
            execute(row)
    except Exception as exc:
        print(json.dumps({'level':'error','message':redact(str(exc))[:1000]}),flush=True)
    finally:
        DRAIN_LOCK.release()


def wake():
    if DRAIN_LOCK.acquire(blocking=False):
        threading.Thread(target=drain,daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def respond(self,status,body):
        text=json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(text)))
        self.end_headers()
        self.wfile.write(text)

    def do_GET(self):
        self.respond(200,{'status':'ok'}) if self.path=='/health' else self.respond(404,{'error':'Not found'})

    def do_POST(self):
        if self.path!='/wake':
            return self.respond(404,{'error':'Not found'})
        expected='Bearer '+os.environ['WORKER_WAKE_TOKEN']
        if not hmac.compare_digest(self.headers.get('Authorization',''),expected):
            return self.respond(401,{'error':'Unauthorized'})
        if int(self.headers.get('Content-Length','0'))!=0:
            return self.respond(400,{'error':'Wake requests must have an empty body'})
        wake()
        self.respond(202,{'accepted':True})


def main():
    for name in ['GITHUB_TOKEN','GROQ_API_KEY','DATABASE_URL','RAILWAY_TOKEN','WORKER_WAKE_TOKEN']:
        if not os.getenv(name):
            raise RuntimeError('Missing required worker setting: '+name)
    server=ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8080'))),Handler)
    wake()
    server.serve_forever()


if __name__=='__main__':
    main()
