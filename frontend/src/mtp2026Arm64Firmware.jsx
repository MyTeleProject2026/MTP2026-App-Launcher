import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, HardDrive, MemoryStick, ShieldCheck, Terminal, Wifi, Zap, Power, ArrowRight } from 'lucide-react';
import { MTP2026_GUEST_PROFILES, normalizeMTP2026GuestProfile } from './mtp2026GuestProfiles.js';

const ARM64 = {
  mtp2026: { kernel:'MTP2026 Microkernel AArch64', firmware:'MTP UEFI 2026.09', board:'MTP2026 Mobile Reference Board', ram:'8 GB', storage:'64 GB virtual NVMe', cpu:'8-core ARM64', gpu:'MTP Graphics 2D/3D' },
  android: { kernel:'MTP Android Kernel AArch64', firmware:'MTP Android Boot Firmware', board:'MTP2026 Android Reference Board', ram:'8 GB', storage:'128 GB virtual UFS', cpu:'8-core ARM64', gpu:'MTP Mobile GPU' },
  windows11: { kernel:'MTP Desktop Kernel AArch64', firmware:'MTP Desktop UEFI', board:'MTP2026 Desktop Reference Board', ram:'16 GB', storage:'256 GB virtual NVMe', cpu:'8-core ARM64', gpu:'MTP Desktop GPU' },
  gaming: { kernel:'MTP Gaming Kernel AArch64', firmware:'MTP Gaming Secure Firmware', board:'MTP2026 Gaming Reference Board', ram:'16 GB', storage:'512 GB virtual NVMe', cpu:'12-core ARM64', gpu:'MTP Gaming GPU' }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function MTP2026Arm64Firmware({ profileId='mtp2026', onReady }) {
  const profile = normalizeMTP2026GuestProfile(profileId);
  const spec = ARM64[profile.id] || ARM64.mtp2026;
  const [stage, setStage] = useState('power');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [startedAt] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    const sequence = [
      ['power','Power-on self test',8],
      ['firmware','Loading MTP2026 ARM64 runtime manifest',24],
      ['secure','Verifying MTP2026 runtime policy',42],
      ['memory','Initializing browser ARM64 execution environment',58],
      ['storage','Initializing MTP2026 application storage',72],
      ['kernel','Preparing MTP2026 OS application shell',88],
      ['userspace','Starting MTP2026 OS application environment',100]
    ];
    (async () => {
      for (const [key,label,target] of sequence) {
        if (cancelled) return;
        setStage(key);
        setLogs(prev => [...prev.slice(-5), `[OK] ${label}`]);
        const from = progress;
        for (let p=from; p<=target; p+=4) {
          if (cancelled) return;
          setProgress(p);
          await sleep(70);
        }
        await sleep(120);
      }
      if (!cancelled) onReady?.();
    })();
    return () => { cancelled = true; };
  }, [profile.id]);

  return <main className="mtp-arm64-boot">
    <section className="mtp-arm64-console">
      <div className="mtp-arm64-top">
        <div className="mtp-arm64-brand"><div className="mtp-arm64-logo">M</div><div><b>MTP2026 ARM64 Firmware</b><small>ARM64 device profile • {profile.label}</small></div></div>
        <span className="mtp-arm64-chip"><ShieldCheck/> SECURE BOOT</span>
      </div>
      <div className="mtp-arm64-main">
        <div className="mtp-arm64-orb"><Cpu/></div>
        <div className="mtp-arm64-kicker">AARCH64 / UEFI-STYLE BOOT</div>
        <h1>Booting {profile.label}</h1>
        <p>This browser session is starting the MTP2026 ARM64 device profile and its application environment. The browser provides the MTP2026 OS shell; a full guest kernel/firmware VM is used only when a native VM provider is available.</p>
        <div className="mtp-arm64-progress"><span style={{width:`${progress}%`}}/></div>
        <div className="mtp-arm64-percent">{progress}% <span>{stage.replace('-', ' ')}</span></div>
        <div className="mtp-arm64-specs">
          <div><Cpu/><b>{spec.cpu}</b><small>Virtual CPU</small></div>
          <div><MemoryStick/><b>{spec.ram}</b><small>Memory</small></div>
          <div><HardDrive/><b>{spec.storage}</b><small>Storage</small></div>
          <div><Wifi/><b>Web I/O</b><small>Browser network</small></div>
        </div>
      </div>
      <div className="mtp-arm64-log"><div className="mtp-arm64-log-head"><Terminal/> Boot log <span>{startedAt.toLocaleTimeString()}</span></div>{logs.map((line,i)=><div key={i}>{line}</div>)}</div>
      <footer className="mtp-arm64-footer"><span><Zap/> {spec.firmware}</span><span>{spec.board}</span><span>MTP2026 application environment ready</span></footer>
    </section>
  </main>;
}
