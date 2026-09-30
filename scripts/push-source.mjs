// All credentials arrive via stdin or ignored .env, never shell arguments or persistent helpers.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {createInterface} from 'node:readline';
let input='';
if(process.argv.includes('--stdin')){
 console.log('Ready for source credential JSON on stdin (input is hidden).');
 const rl=createInterface({input:process.stdin,terminal:false});
 input=await new Promise(resolve=>rl.once('line',resolve));rl.close();
}
const config=input.trim()?JSON.parse(input):{};
let token=config.token;
if(!token)token=readFileSync('.env','utf8').match(/^GITHUB_TOKEN=(.+)$/m)[1];
const remote=config.remote||'https://github.com/wauul/PatchGoblin.git';
const branch=config.branch||'main';
mkdirSync('.local',{recursive:true});
const helper='.local/git-askpass.cjs';
writeFileSync(helper,"process.stdout.write(process.argv[2].includes('Username')?'x-access-token':process.env.PATCHGOBLIN_GIT_TOKEN)");
const wrapper='.local/git-askpass.cmd';
writeFileSync(wrapper,`@"${process.execPath}" "${process.cwd()}\\${helper.replaceAll('/','\\')}" %*`);
const env={...process.env,PATCHGOBLIN_GIT_TOKEN:token,GIT_ASKPASS:process.cwd().replaceAll('\\','/')+'/'+wrapper,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:config.auth_mode==='http_extra_header'?'http.extraHeader':'credential.helper',GIT_CONFIG_VALUE_0:config.auth_mode==='http_extra_header'?'Authorization: Bearer '+token:''};
const result=spawnSync('git',['push',remote,`HEAD:refs/heads/${branch}`],{env,encoding:'utf8'});
unlinkSync(helper);
unlinkSync(wrapper);
process.stdout.write((result.stdout+result.stderr).replaceAll(token,'[REDACTED]'));
process.exit(result.status??1);
