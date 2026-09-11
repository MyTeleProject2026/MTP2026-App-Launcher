.section .text.vectors,"ax"
.align 11
.global mtp2026_vectors
.type mtp2026_vectors, %function

// AArch64 EL1 vector table. Each entry is 128-byte aligned.
// The current foundation preserves the exception return state and then
// parks safely; device-specific interrupt dispatch is added by the GIC layer.
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
