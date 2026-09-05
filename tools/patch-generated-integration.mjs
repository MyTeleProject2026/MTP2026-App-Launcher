#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (flag) => { const i=args.indexOf(flag); return i>=0 ? args[i+1] : null; };
const target = path.resolve(get('--target') || process.cwd());
const generated = path.resolve(get('--generated') || path.join(ROOT,'generated','my-vexa-app'));
const force = args.includes('--force');

const marker = '// MTP2026-VEXAACCOUNT-INTEGRATION: managed';
const srcRoot = path.join(generated, 'frameworks');
const entries = [];
async function walk(dir){ for(const e of await fs.readdir(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) await walk(p); else entries.push(p); } }
await walk(srcRoot);
for(const source of entries){
  const relative=path.relative(srcRoot,source);
  const destination=path.join(target,'vexaaccount',relative);
  const original=await fs.readFile(source,'utf8');
  const content=`${marker}\n${original}`;
  let existing=null; try { existing=await fs.readFile(destination,'utf8'); } catch {}
  if(existing && !force){ console.log(`skip existing: ${destination}`); continue; }
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,content,'utf8');
  console.log(`${existing ? 'updated' : 'created'}: ${destination}`);
}
console.log('Patch complete. Review generated files and run the generated tests before committing.');
