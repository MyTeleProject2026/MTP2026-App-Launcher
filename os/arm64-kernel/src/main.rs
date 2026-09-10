#![no_std]
#![no_main]

use core::panic::PanicInfo;

mod arch;

/// Platform-neutral information passed by an ARM64 boot loader.
/// Device-specific boot code must populate this structure from firmware or DTB
/// data before entering the MTP2026 kernel at EL1.
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
    pub gicd_base: u64,
    pub gicr_base: u64,
}

pub const BOOT_MAGIC: u64 = 0x4D54503230323641;
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

#[unsafe(no_mangle)]
extern "C" fn rust_entry(info: *const Arm64BootInfo) -> ! {
    arch::exceptions::mask_interrupts();

    let boot = unsafe { info.as_ref() };
    if let Some(boot) = boot {
        if boot.magic == BOOT_MAGIC && boot.version == 1 {
            if boot.uart_kind == UART_PL011 && boot.uart_base != 0 {
                uart_line(boot.uart_base, b"MTP2026 ARM64 KERNEL\r\n");
                uart_line(boot.uart_base, b"Architecture: AArch64 / EL1\r\n");
                uart_line(boot.uart_base, b"Boot contract: valid\r\n");
                uart_line(boot.uart_base, b"Generic timer: available\r\n");
                uart_line(boot.uart_base, b"GIC: platform supplied\r\n");
            }

            // Only read the architectural timer after validating the boot
            // contract. Device-specific interrupt-controller programming is
            // deliberately deferred until the correct GIC version/base is
            // known from the target's platform description.
            let _ = arch::timer::frequency();
            let _ = arch::timer::counter();
        }
    }

    loop {
        unsafe { core::arch::asm!("wfe", options(nomem, nostack, preserves_flags)); }
    }
}

fn uart_line(base: u64, bytes: &[u8]) {
    for &byte in bytes {
        unsafe { pl011_write(base, byte); }
    }
}

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
