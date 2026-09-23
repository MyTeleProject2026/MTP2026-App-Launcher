# MTP2026 Guest Runtime Architecture

MTP2026 is a host/guest launcher. The launcher UI is not itself a Windows, iOS, or Android kernel. A guest becomes a real OS only when an execution provider supplies CPU virtualization/emulation and a valid guest image.

## Host modes

- **Android APK / Capacitor:** native storage and native guest-provider bridge can be supplied by `window.MTP2026NativeGuestRuntime` and `window.MTP2026NativeGuestStorage`.
- **Desktop native:** the Tauri host can supply the same provider contract.
- **Web/PWA:** the browser uses OPFS/IndexedDB for guest metadata. A real guest needs a browser-compatible WASM/WebAssembly VM/emulator provider; the launcher never pretends that CSS/JS is a kernel.

## Guest lifecycle

`Choose system -> splash -> prepare -> provider check -> boot -> services -> ready`

The provider contract is:

```js
window.MTP2026NativeGuestRuntime = {
  async bootGuest({ id, architecture, class, image, storage }) {},
  async stopGuest() {},
};
```

A provider should return `{ provider, image, pidOrVmId }` and must reject unsupported images instead of reporting a fake ready state.

## Images and licensing

MTP2026 may download or import open-source images and user-owned/licensed images. It must not bundle or distribute cracked Windows, iOS, Android, driver, or kernel packages. Windows 11 and iOS require appropriate licensed/native images and an execution environment that supports them.

## Storage

The web host uses OPFS/IndexedDB capabilities and asks for persistent storage only when a guest installation is started. Native hosts can map the guest volume to application-managed device storage. The host must not assume that `/Android/data` is writable from an ordinary browser; Android scoped-storage rules are enforced by the native host.

## Non-blocking startup

Guest boot is asynchronous and must never gate the launcher shell. A slow network request, image download, VM boot, or unavailable provider produces a guest-state error while the launcher remains interactive.


## Browser real-guest path

When a real QEMU-AArch64 WebAssembly build is installed, it exposes:

```js
window.MTP2026QemuWasmRuntime = {
  engine: 'qemu-system-aarch64-wasm',
  async boot({ id, architecture, machine, image, storage, boot }) {
    // Boot the verified ARM64 guest bundle and return { ready: true, ... }.
  },
  async stop(id) {}
};
```

MTP2026 then routes a verified guest image through this provider. The launcher does not use Unicorn.js as a substitute for a complete system VM: Unicorn remains useful for CPU/instruction-level testing, while QEMU-WASM is the system-emulation path.

A missing QEMU-WASM provider is reported as a runtime-provider requirement rather than a fake OS boot. The normal MTP2026 launcher remains usable without a guest image.
