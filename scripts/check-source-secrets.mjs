// Scan tracked source and all reachable Git blobs; never print matched values.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const credentialPatterns=[
 /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|gsk_[A-Za-z0-9_-]{20,})/g,
 /(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})/g,
 /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
 /postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/g,
];
// Exact public CI fixture, not a wildcard path exclusion.
const synthetic='postgresql://postgres:guardrails-ci-only@127.0.0.1:5432/guardrails';
export function containsCredential(text){const clean=text.replaceAll(synthetic,'');return credentialPatterns.some(pattern=>{pattern.lastIndex=0;return pattern.test(clean);});}
export async function scan(){
 const git=(args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:100_000_000});
 const files=git(['ls-files','-z']).split('\0').filter(Boolean);
 let checked=0;
 for(const file of files){const raw=await readFile(file);if(!raw.includes(0)&&containsCredential(raw.toString('utf8')))throw Error('Potential credential in tracked file: '+file);checked++;}
 const blobs=git(['rev-list','--objects','--all']).split('\n').filter(Boolean);
 const types=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{input:blobs.map(line=>line.split(' ')[0]).join('\n')+'\n',encoding:'utf8',maxBuffer:20_000_000}).trim().split('\n');
 for(const line of types){const [oid,type]=line.split(' ');if(type!=='blob')continue;const raw=execFileSync('git',['cat-file','blob',oid],{maxBuffer:100_000_000});if(!raw.includes(0)&&containsCredential(raw.toString('utf8')))throw Error('Potential credential in Git blob: '+oid);checked++;}
 console.log(`Secret scan passed: ${checked} tracked files/history blobs. No credential values printed.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await scan();
