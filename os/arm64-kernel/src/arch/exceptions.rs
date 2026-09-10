#![allow(dead_code)]

use core::arch::asm;

/// Install the architectural AArch64 exception-vector base address.
/// The vector table itself is supplied by `vectors.S`; this function only
/// publishes its address to VBAR_EL1 after the kernel has entered EL1.
pub unsafe fn install_vectors(vector_base: u64) {
    unsafe {
        asm!("msr VBAR_EL1, {0}", "isb", in(reg) vector_base, options(nostack, preserves_flags));
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
