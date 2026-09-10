#![no_std]
#![no_main]

use core::panic::PanicInfo;

/// Minimal boot contract for an ARM64 MTP2026 platform loader.
///
/// x0 must point to a valid Arm64BootInfo structure. The platform loader is
/// responsible for supplying the kernel stack and entering at the `_start`
/// symbol in EL1. No Android/Linux userspace assumptions are made here.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct Arm64BootInfo {
    pub magic: u64,
    pub version: u32,
    pub _reserved: u32,
    pub uart_base: u64,
    pub uart_kind: u32,
    pub _reserved2: u32,
    pub memory_base: u64,
    pub memory_size: u64,
    pub dtb_address: u64,
}

pub const BOOT_MAGIC: u64 = 0x4D54503230323641; // "MTP2026A"
pub const UART_NONE: u32 = 0;
pub const UART_PL011: u32 = 1;

#[unsafe(no_mangle)]
#[unsafe(naked)]
pub extern "C" fn _start() -> ! {
    core::arch::naked_asm!(
        "mov x19, x0",
        "bl {entry}",
        "1:",
        "wfe",
        "b 1b",
        entry = sym rust_entry,
    )
}

/// Entry reached after the platform loader has established an EL1 stack.
/// This intentionally validates the boot contract before touching MMIO.
#[unsafe(no_mangle)]
extern "C" fn rust_entry(info: *const Arm64BootInfo) -> ! {
    let boot = unsafe { info.as_ref() };
    if let Some(boot) = boot {
        if boot.magic == BOOT_MAGIC && boot.version == 1 {
            if boot.uart_kind == UART_PL011 && boot.uart_base != 0 {
                unsafe { pl011_write(boot.uart_base, b'M'); }
                unsafe { pl011_write(boot.uart_base, b'T'); }
                unsafe { pl011_write(boot.uart_base, b'P'); }
                unsafe { pl011_write(boot.uart_base, b'2'); }
                unsafe { pl011_write(boot.uart_base, b'0'); }
                unsafe { pl011_write(boot.uart_base, b'2'); }
                unsafe { pl011_write(boot.uart_base, b'6'); }
                unsafe { pl011_write(boot.uart_base, b'\r'); }
                unsafe { pl011_write(boot.uart_base, b'\n'); }
            }
        }
    }

    loop {
        unsafe { core::arch::asm!("wfe", options(nomem, nostack, preserves_flags)); }
    }
}

/// ARM PrimeCell PL011 transmit path. The actual UART base is supplied by the
/// device-specific loader/device-tree port; this kernel never guesses a phone's
/// MMIO address.
unsafe fn pl011_write(base: u64, byte: u8) {
    const FR: u64 = 0x18;
    const DR: u64 = 0x00;
    const TXFF: u32 = 1 << 5;

    let flag = (base + FR) as *const u32;
    while core::ptr::read_volatile(flag) & TXFF != 0 {
        core::hint::spin_loop();
    }
    core::ptr::write_volatile((base + DR) as *mut u32, byte as u32);
}

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {
        unsafe { core::arch::asm!("wfe", options(nomem, nostack, preserves_flags)); }
    }
}
