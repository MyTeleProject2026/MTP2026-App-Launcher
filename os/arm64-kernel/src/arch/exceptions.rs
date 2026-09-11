#![allow(dead_code)]

use core::arch::asm;

unsafe extern "C" {
    static mtp2026_vectors: u8;
}

/// Install the MTP2026 AArch64 EL1 exception vector table.
///
/// The vector table is 2048-byte aligned and contains the architecturally
/// defined EL1 synchronous/IRQ/FIQ/SError entry points.
pub unsafe fn init() {
    let vector_base = &mtp2026_vectors as *const u8 as u64;
    unsafe {
        asm!(
            "msr VBAR_EL1, {0}",
            "isb",
            in(reg) vector_base,
            options(nostack, preserves_flags)
        );
    }
}

/// Disable IRQ/FIQ delivery while low-level kernel state is being changed.
pub fn mask_interrupts() {
    unsafe { asm!("msr daifset, #3", options(nomem, nostack, preserves_flags)); }
}

/// Enable normal IRQ delivery after the interrupt controller has been set up.
pub fn unmask_irqs() {
    unsafe { asm!("msr daifclr, #2", options(nomem, nostack, preserves_flags)); }
}
