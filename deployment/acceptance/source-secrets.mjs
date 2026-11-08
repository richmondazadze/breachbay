// Review an extracted source-only publication candidate with protected process environment.
// Never prints secret values, matching source text, or arbitrary exception messages.
import {readdir,readFile,realpath} from 'node:fs/promises';
import {join,relative} from 'node:path';
const protectedNames=['CLERK_SECRET_KEY','NEMOTRON_API_KEY','GEMINI_API_KEY','OPENAI_API_KEY','ELEVENLABS_API_KEY','AI_SERVICE_ID_TOKEN','AI_SERVICE_CLERK_SESSION_ID','AI_SERVICE_CLERK_USER_ID'];
const values=protectedNames.map(name=>process.env[name]).filter(value=>typeof value==='string'&&value.length>=8);
const forbiddenDirectories=new Set(['.git','.next','node_modules','private','__pycache__']);
const credentialPatterns=[
  ['NVIDIA_KEY',/nvapi-[A-Za-z0-9_-]{30,}/],
  ['CLERK_SECRET',/sk_(?:live|test)_[A-Za-z0-9_+/=-]{30,}/],
  ['GITHUB_TOKEN',/gh[pousr]_[A-Za-z0-9]{30,}/],
  ['OPENAI_KEY',/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/],
];
let files=0,failed=false;
try {
  if(!values.length||!process.env.BREACHBAY_SOURCE_PATH)throw new Error('SETUP');
  const root=await realpath(process.env.BREACHBAY_SOURCE_PATH);
  const deny=(label,kind)=>{console.error('FAIL: publication candidate '+kind+' at '+label);failed=true;};
  async function scan(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name),label=relative(root,path);
      if(entry.isSymbolicLink()){deny(label,'SYMLINK');continue;}
      if(entry.isDirectory()){
        if(forbiddenDirectories.has(entry.name)){deny(label,'PRIVATE_OR_RUNTIME_DIRECTORY');continue;}
        await scan(path);
      }else if(entry.isFile()){
        if((entry.name==='.env'||entry.name.startsWith('.env.')&&entry.name!=='.env.example')||/\.(?:pem|key|tsbuildinfo)$/.test(entry.name)){deny(label,'PRIVATE_FILE');continue;}
        const bytes=await readFile(path);files++;
        for(const value of values){
          const representations=new Set([value,encodeURIComponent(value),JSON.stringify(value).slice(1,-1)]);
          if([...representations].some(v=>bytes.includes(Buffer.from(v)))){deny(label,'CONFIGURED_PROTECTED_VALUE');break;}
        }
        const source=bytes.toString('utf8');
        for(const [kind,pattern] of credentialPatterns)if(pattern.test(source))deny(label,kind);
      }
    }
  }
  await scan(root);
  if(!files)throw new Error('EMPTY');
  if(!failed)console.log('PASS: '+files+' publication source files; configured protected values absent, credential patterns absent, private/runtime files excluded');
}catch{console.error('FAIL: publication source review setup or read; no secret/source text output');failed=true;}
if(failed)process.exitCode=1;
