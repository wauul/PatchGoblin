"""Railway SDK bridge; it executes only trusted tool code outside Docker."""
import json
import queue
import subprocess
import threading
import time
from pathlib import Path
from worker.project import validate_command
from worker.security import safe_path


class RailwaySandbox:
    def __init__(self,root,cancelled,deadline,identity,on_created=lambda _:None):
        self.root,self.cancelled,self.deadline=root,cancelled,deadline
        self.identity,self.on_created=identity,on_created
        self.process=None
        self.output=queue.Queue()
        self.calls=0
        self.last_files=self.files()
        self.initialized=False
        self.reset_next=False
        self.sandbox_id=None

    def files(self):
        files={}
        for name in ['requirements.txt','requirements-dev.txt','pyproject.toml','uv.lock']:
            if (self.root/name).is_file():
                files[name]=(self.root/name).read_text()
        for path in (self.root/'.github/workflows').glob('*'):
            if path.suffix in {'.yml','.yaml'}:
                files[safe_path(path.relative_to(self.root).as_posix())]=path.read_text()
        return files

    def request(self,payload,cleanup=False):
        self.process.stdin.write(json.dumps(payload)+'\n')
        self.process.stdin.flush()
        limit=time.monotonic()+45 if cleanup else self.deadline
        while time.monotonic()<limit:
            if not cleanup and self.cancelled():
                raise InterruptedError('Job cancelled')
            try:
                value=self.output.get(timeout=.5)
            except queue.Empty:
                continue
            if value is None:
                raise RuntimeError('Railway sandbox bridge stopped')
            result=json.loads(value)
            if result.get('sandbox_id'):
                self.sandbox_id=result['sandbox_id']
                self.on_created(self.sandbox_id)
            if result.get('event')=='created':
                continue
            if 'error' in result:
                raise RuntimeError(result['error'])
            if cleanup and not result.get('closed'):
                continue
            return result
        raise TimeoutError('Railway sandbox deadline exceeded')

    def start(self):
        bridge=Path(__file__).resolve().parent.parent/'scripts/railway-sandbox-bridge.mjs'
        self.process=subprocess.Popen(['node',str(bridge)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
        def read():
            for line in self.process.stdout:
                if len(line)>300000:
                    self.output.put(None)
                    return
                self.output.put(line)
            self.output.put(None)
        threading.Thread(target=read,daemon=True).start()
        result=self.request({'op':'init',**self.identity,'remaining_seconds':int(self.deadline-time.monotonic())})
        self.sandbox_id=result['sandbox_id']
        self.initialized=True
        self.calls+=1

    def run(self,command,python,install=False):
        if command!='uv lock':
            validate_command(command)
        if not self.initialized:
            self.start()
        files=self.files()
        changes={p:v for p,v in files.items() if self.last_files.get(p)!=v}
        reset=bool(changes) or self.reset_next
        self.last_files=files
        result=self.request({'op':'run','command':command,'python':python,'install':install,'files':changes,
                             'reset_environment':reset,'remaining_seconds':int(self.deadline-time.monotonic())})
        self.calls+=result.pop('tool_calls',1)
        self.reset_next=False
        for name,content in result.pop('generated_files',{}).items():
            if name!='uv.lock':
                raise ValueError('Remote tool generated an unauthorized file')
            (self.root/name).write_text(content)
            self.last_files[name]=content
            self.reset_next=True
        return result

    def close(self):
        if self.process:
            try:
                if self.sandbox_id:
                    destroy(self.sandbox_id)
                    self.on_created(None)
                else:
                    self.request({'op':'close'},cleanup=True)
            except Exception:
                # The database retains the VM ID for startup cleanup. The VM also
                # has a three-minute idle timeout if the control plane is unavailable.
                pass
            finally:
                try:
                    self.process.stdin.close()
                except BrokenPipeError:
                    pass
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)


def destroy(sandbox_id):
    bridge=Path(__file__).resolve().parent.parent/'scripts/railway-sandbox-bridge.mjs'
    result=subprocess.run(['node',str(bridge)],input=json.dumps({'op':'destroy','sandbox_id':sandbox_id})+'\n',
                          capture_output=True,text=True,timeout=45,check=True)
    if not any(json.loads(line).get('closed') for line in result.stdout.splitlines()):
        raise RuntimeError('Disposable VM cleanup did not succeed')
