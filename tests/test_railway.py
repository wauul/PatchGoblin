import json
import time
import queue
import pytest
from worker.railway_sandbox import RailwaySandbox


def test_builder_first_command_transfers_the_added_workflow(tmp_path):
    (tmp_path/'requirements.txt').write_text('pytest\n')
    sandbox=RailwaySandbox(tmp_path,lambda:False,time.monotonic()+60,{'repo':'a/b','sha':'f'*40})
    sandbox.initialized=True
    path=tmp_path/'.github/workflows/patchgoblin.yml'
    path.parent.mkdir(parents=True)
    path.write_text('trusted draft workflow')
    requests=[]
    sandbox.request=lambda payload:requests.append(payload) or {'exit_code':0,'tool_calls':1}
    sandbox.run('python -m pip install -r requirements.txt','3.12',True)
    assert requests[0]['files']=={'.github/workflows/patchgoblin.yml':'trusted draft workflow'}
    assert requests[0]['reset_environment'] is True
    sandbox.run('python -m pytest','3.12')
    assert requests[1]['files']=={}
    assert requests[1]['reset_environment'] is False


def test_cleanup_does_not_mistake_a_pending_command_response_for_destruction(tmp_path):
    sandbox=RailwaySandbox(tmp_path,lambda:False,time.monotonic()+60,{})
    class Input:
        def write(self,value):
            pass
        def flush(self):
            pass
    class Process:
        stdin=Input()
    sandbox.process=Process()
    sandbox.output=queue.Queue()
    sandbox.output.put(json.dumps({'exit_code':0}))
    sandbox.output.put(json.dumps({'closed':True}))
    assert sandbox.request({'op':'close'},cleanup=True)=={'closed':True}


def test_cancellation_stops_waiting_for_repository_execution(tmp_path):
    sandbox=RailwaySandbox(tmp_path,lambda:True,time.monotonic()+60,{})
    class Input:
        def write(self,value):
            pass
        def flush(self):
            pass
    class Process:
        stdin=Input()
    sandbox.process=Process()
    with pytest.raises(InterruptedError):
        sandbox.request({'op':'run'})
