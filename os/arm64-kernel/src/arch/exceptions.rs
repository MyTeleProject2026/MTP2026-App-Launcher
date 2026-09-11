#![allow(dead_code)]

use core::arch::{asm, global_asm};

global_asm!(r#"
    .section .text.vectors,"ax"
    .align 11
    .global mtp2026_vectors
    .type mtp2026_vectors, %function

// AArch64 EL1 vector table: 16 entries, each exactly 128 bytes.
// The entries currently park safely until the GIC dispatch path is enabled.
mtp2026_vectors:
    b mtp2026_sync
    .space 124
    b mtp2026_irq
    .space 124
    b mtp2026_fiq
    .space 124
    b mtp2026_serror
    .space 124

    b mtp2026_sync
    .space 124
    b mtp2026_irq
    .space 124
    b mtp2026_fiq
    .space 124
    b mtp2026_serror
    .space 124

    b mtp2026_sync
    .space 124
    b mtp2026_irq
    .space 124
    b mtp2026_fiq
    .space 124
    b mtp2026_serror
    .space 124

    b mtp2026_sync
    .space 124
    b mtp2026_irq
    .space 124
    b mtp2026_fiq
    .space 124
    b mtp2026_serror
    .space 124

mtp2026_sync:
    wfe
    b mtp2026_sync

mtp2026_irq:
    wfe
    b mtp2026_irq

mtp2026_fiq:
    wfe
    b mtp2026_fiq

mtp2026_serror:
    wfe
    b mtp2026_serror
"#);

unsafe extern "C" {
    static mtp2026_vectors: u8;
}

/// Install the MTP2026 AArch64 EL1 exception vector table.
///
/// The table is 2048-byte aligned and contains all 16 architecturally
/// defined EL1 vector slots. IRQ delivery remains masked until the GIC
/// dispatcher is ready.
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
