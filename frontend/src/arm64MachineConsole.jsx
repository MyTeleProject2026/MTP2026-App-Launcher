import React, { useState } from 'react';
import { Cpu, Play, Upload, Terminal, CheckCircle2 } from 'lucide-react';
import { createARM64CPU, executeARM64Image } from './arm64Emulator.js';

const DEMO = new Uint8Array([
  0x40,0x05,0x80,0xd2, // mov x0,#42
  0xe1,0x00,0x80,0xd2, // mov x1,#7
  0x02,0x00,0x01,0x8b  // add x2,x0,x1
]);

export function ARM64MachineConsole() {
  const [running,setRunning]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [fileName,setFileName]=useState('');

  async function run(bytes,name='Built-in ARM64 test') {
    setRunning(true); setError(''); setResult(null); setFileName(name);
    try {
      const output=await executeARM64Image(bytes,{instructionCount:1000});
      setResult(output);
    } catch(e) { setError(e?.message || String(e)); }
    finally { setRunning(false); }
  }

  async function upload(e) {
    const file=e.target.files?.[0]; if(!file) return;
    run(await file.arrayBuffer(),file.name);
    e.target.value='';
  }

  return <section className="mtp-arm64-machine-console">
    <div className="mtp-arm64-console-head">
      <div><Cpu/><div><b>ARM64 Machine Runtime</b><small>WebAssembly CPU execution • AArch64</small></div></div>
      <label><Upload/> Load ARM64 image<input type="file" accept=".bin,.elf,.img,.gz" onChange={upload}/></label>
    </div>
    <div className="mtp-arm64-runtime-note">This executes ARM64 instructions in the browser using the Unicorn.js WebAssembly CPU engine. ELF64/AArch64 program loading is supported; a complete Linux/Android/Windows kernel still requires a full machine model, MMU and device/peripheral emulation.</div>
    <button className="mtp-arm64-run-demo" disabled={running} onClick={()=>run(DEMO)}><Play/>{running?'Executing…':'Run ARM64 machine-code test'}</button>
    {fileName && <div className="mtp-arm64-loaded"><Terminal/> {fileName}</div>}
    {result && <div className="mtp-arm64-result"><CheckCircle2/><div><b>Execution completed</b><code>{JSON.stringify(result,null,2)}</code></div></div>}
    {error && <div className="mtp-arm64-runtime-error">{error}</div>}
  </section>;
}
