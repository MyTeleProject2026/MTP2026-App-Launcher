#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const dir = path.resolve(i >= 0 && args[i+1] ? args[i+1] : path.join(ROOT,'generated','my-vexa-app'));
const required = ['README.md','.env.example','vexaaccount-sso.config.json','tests/vexaaccount-sso.test.mjs','deploy/render.yaml','patch/INTEGRATION_PATCH.md'];
const missing=[];
for(const file of required){ try { const s=await fs.stat(path.join(dir,file)); if(!s.isFile()||s.size===0) missing.push(file); } catch { missing.push(file); } }
const cfg=JSON.parse(await fs.readFile(path.join(dir,'vexaaccount-sso.config.json'),'utf8'));
if(!/^https:\/\//.test(cfg.url)) throw new Error('SSO provider URL must be HTTPS');
if(!/^https:\/\//.test(cfg.redirectUri)) throw new Error('Redirect URI must be HTTPS');
if(!Array.isArray(cfg.scopes)||!cfg.scopes.includes('openid')) throw new Error('openid scope is required');
if(cfg.clientSecret || cfg.secret) throw new Error('Generated config must not contain a client secret');
if(missing.length) throw new Error(`Missing generated files: ${missing.join(', ')}`);
await new Promise((resolve,reject)=>{ const child=spawn(process.execPath,['--test','tests/vexaaccount-sso.test.mjs'],{cwd:dir,stdio:'inherit'}); child.on('exit',code=>code===0?resolve():reject(new Error(`generated tests exited with ${code}`))); });
console.log(`Generated integration verification passed: ${dir}`);
