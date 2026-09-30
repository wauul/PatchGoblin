"""Explicit public seeded lab operations, separate from agent verification."""
import json
import os
import subprocess
import tempfile
import base64
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker.app_auth import app_request,InstallationGitHub

for line in Path('.local/github-app.env').read_text().splitlines():
    if '=' in line:
        key,value=line.split('=',1);os.environ[key]=value
repo=next((x.split('=',1)[1] for x in __import__('sys').argv if x.startswith('--target=')),'wauul/patchgoblin-product-lab')
if repo not in {'wauul/patchgoblin-product-lab','wauul/patchgoblin-lab'}:
    raise ValueError('Only the two named disposable public labs may be seeded')
installation=app_request('GET',f'/repos/{repo}/installation')
if not installation:raise RuntimeError('Install the App on the product lab first')
from worker.github import GitHub
token=app_request('POST',f"/app/installations/{installation['id']}/access_tokens")['token']
metadata=GitHub(token).request('GET',f'/repos/{repo}')
github=InstallationGitHub(installation['id'],metadata['id'],repo)


def commit(files,message,branch='main'):
    current=github.request('GET',f'/repos/{repo}/commits/{branch}')
    tree=github.request('POST',f'/repos/{repo}/git/trees',json={'base_tree':current['commit']['tree']['sha'],'tree':[{'path':p,'content':content,'mode':'100644','type':'blob'} for p,content in files.items()]})
    result=github.request('POST',f'/repos/{repo}/git/commits',json={'message':message,'tree':tree['sha'],'parents':[current['sha']]})
    github.request('PATCH',f'/repos/{repo}/git/refs/heads/{branch}',json={'sha':result['sha'],'force':False})
    print(json.dumps({'seeded':True,'repo':repo,'branch':branch,'sha':result['sha'],'files':list(files)}))


if '--init-node' in __import__('sys').argv:
    package={'name':'patchgoblin-product-lab','version':'1.0.0','private':True,'type':'module','engines':{'node':'>=22 <25'},'scripts':{'test':'node --test','lint':'node --check src/math.js','build':'node scripts/build.mjs'}}
    lock={'name':package['name'],'version':'1.0.0','lockfileVersion':3,'requires':True,'packages':{'':{'name':package['name'],'version':'1.0.0','engines':package['engines']}}}
    commit({'package.json':json.dumps(package,indent=2)+'\n','package-lock.json':json.dumps(lock,indent=2)+'\n','src/math.js':'export const sum = (a, b) => a + b;\n','tests/math.test.js':"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {sum} from '../src/math.js';\nfor(const [a,b,result] of [[1,2,3],[0,0,0],[-1,1,0],[3,4,7]])test(`sum ${a} ${b}`,()=>assert.equal(sum(a,b),result));\n",'scripts/build.mjs':"import {mkdir,copyFile} from 'node:fs/promises';\nawait mkdir('dist',{recursive:true});\nawait copyFile('src/math.js','dist/math.js');\n",'README.md':'# PatchGoblin product lab\n\nPublic, deliberately seeded verification fixtures. This is not a customer repository.\n\nRoot commands: `npm ci`, `npm run test`, `npm run lint`, `npm run build`. Initially there is no CI. Later commits intentionally add customized CI, a new package, and dependency-install failures.\n'},'Seed real Node checks without CI')
if '--custom-ci' in __import__('sys').argv:
    workflow='''# Hand-written customization: preserve this comment and the report step.
name: Customized root CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  root:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run test
      - run: npm run lint
      - run: npm run build
      - name: Hand-written report
        run: echo 'Do not overwrite this custom report'
'''
    commit({'.github/workflows/custom-ci.yml':workflow},'Seed a customized root workflow for maintenance evaluation')
if '--custom-python-ci' in __import__('sys').argv:
    workflow='''# Hand-written customization: preserve this comment and the report step.
name: Customized Python CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  root:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: python -m pip install -r requirements.txt
      - run: python -m pytest
      - name: Hand-written report
        run: echo 'Do not overwrite this custom report'
'''
    commit({'.github/workflows/custom-python-ci.yml':workflow},'Seed a customized Python workflow for mixed-language maintenance evaluation')
if '--add-package' in __import__('sys').argv:
    package={'name':'seeded-widget','version':'1.0.0','private':True,'type':'module','engines':{'node':'>=22 <25'},'scripts':{'test':'node --test','typecheck':'tsc --noEmit','build':'tsc'},'devDependencies':{'typescript':'5.9.3'}}
    with tempfile.TemporaryDirectory(prefix='pg-seed-') as directory:
        root=Path(directory);(root/'package.json').write_text(json.dumps(package))
        node_path=subprocess.run(['node','-p','process.execPath'],capture_output=True,text=True,check=True).stdout.strip()
        npm=Path(node_path).parent/'node_modules/npm/bin/npm-cli.js'
        result=subprocess.run([node_path,str(npm),'install','--package-lock-only','--ignore-scripts'],cwd=root,capture_output=True,text=True)
        if result.returncode:raise RuntimeError('Canonical fixture lock generation failed')
        lock=(root/'package-lock.json').read_text()
    commit({'apps/widget/package.json':json.dumps(package,indent=2)+'\n','apps/widget/package-lock.json':lock,'apps/widget/src/math.ts':'export const multiply = (a: number, b: number): number => a * b;\n','apps/widget/tsconfig.json':json.dumps({'compilerOptions':{'target':'ES2022','module':'NodeNext','moduleResolution':'NodeNext','strict':True,'outDir':'dist'},'include':['src/**/*.ts']},indent=2)+'\n','apps/widget/tests/widget.test.js':"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {multiply} from '../src/math.ts';\ntest('widget multiplication',()=>assert.equal(multiply(6,7),42));\n"},'Seed a new TypeScript package with test, type-check and build commands')
if '--add-widget-lint' in __import__('sys').argv:
    current=github.request('GET',f'/repos/{repo}/contents/apps/widget/package.json?ref=main')
    package=json.loads(base64.b64decode(current['content']))
    package['scripts']['lint']='tsc --noEmit'
    commit({'apps/widget/package.json':json.dumps(package,indent=2)+'\n'},'Seed a newly declared TypeScript lint check for automatic maintenance')
if '--seed-node-failure' in __import__('sys').argv:
    branch='seed/npm-lock-drift'
    current=github.request('GET',f'/repos/{repo}/commits/main')
    github.request('POST',f'/repos/{repo}/git/refs',json={'ref':'refs/heads/'+branch,'sha':current['sha']})
    package=json.loads(base64.b64decode(github.request('GET',f'/repos/{repo}/contents/package.json?ref=main')['content']))
    package['devDependencies']={'typescript':'5.9.3'}
    package['scripts']['typecheck']='tsc --noEmit -p apps/widget/tsconfig.json'
    workflow=base64.b64decode(github.request('GET',f'/repos/{repo}/contents/.github/workflows/custom-ci.yml?ref=main')['content']).decode()
    workflow=workflow.replace("      - name: Hand-written report\n        run: echo 'Do not overwrite this custom report'\n",'')
    workflow=workflow.replace('      - run: npm run build','      - run: npm run typecheck\n      - run: npm run build')
    workflow=workflow.replace('# Hand-written customization: preserve this comment and the report step.','# Deliberately seeded simple failure fixture; main retains its custom report.')
    commit({'package.json':json.dumps(package,indent=2)+'\n','.github/workflows/custom-ci.yml':workflow},'Seed an intentional npm lock mismatch; preserve tests and main customization',branch)
if '--seed-python-failure' in sys.argv:
    if repo != 'wauul/patchgoblin-lab':
        raise ValueError('Python failure is only defined for the Python lab')
    branch = 'seed/pip-conflict-v2'
    current = github.request('GET', f'/repos/{repo}/commits/broken-install')
    github.request('POST', f'/repos/{repo}/git/refs', json={'ref': 'refs/heads/'+branch, 'sha': current['sha']})
    commit({'README.md': '# Disposable Python dependency failure\n\nA fresh labeled copy of the original conflicting pip fixture. Six original tests and the failing workflow remain unchanged.\n'}, 'Seed a fresh automatic pip repair evaluation', branch)
if '--seed-mixed-node-failure' in sys.argv:
    if repo != 'wauul/patchgoblin-lab':
        raise ValueError('Mixed failure is only defined for the Python lab')
    branch = 'seed/npm-lock-v2'
    current = github.request('GET', f'/repos/{repo}/commits/main')
    github.request('POST', f'/repos/{repo}/git/refs', json={'ref': 'refs/heads/'+branch, 'sha': current['sha']})
    package = {'name':'mixed-node-fixture','version':'1.0.0','private':True,'type':'module','engines':{'node':'>=22 <25'},'scripts':{'test':'node --test tests/node.test.js','lint':'node --check src/math.js','typecheck':'tsc --noEmit -p apps/widget/tsconfig.json','build':'node scripts/build.mjs'},'devDependencies':{'typescript':'5.9.3'}}
    lock = {'name':package['name'],'version':'1.0.0','lockfileVersion':3,'requires':True,'packages':{'':{'name':package['name'],'version':'1.0.0','engines':package['engines']}}}
    workflow = '''# Deliberately seeded dependency lock mismatch; source and checks must survive repair.
name: Seeded Node CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run test
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
'''
    commit({'package.json':json.dumps(package,indent=2)+'\n','package-lock.json':json.dumps(lock,indent=2)+'\n','src/math.js':'export const sum = (a, b) => a + b;\n','tests/node.test.js':"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {sum} from '../src/math.js';\nfor(const [a,b,result] of [[1,2,3],[0,0,0],[-1,1,0],[3,4,7]])test(`sum ${a} ${b}`,()=>assert.equal(sum(a,b),result));\n",'scripts/build.mjs':"import {mkdir,copyFile} from 'node:fs/promises';\nawait mkdir('dist',{recursive:true});\nawait copyFile('src/math.js','dist/math.js');\n",'.github/workflows/node-ci.yml':workflow},'Seed a fresh npm lock mismatch on a mixed-language fixture branch',branch)
github.client.close()
