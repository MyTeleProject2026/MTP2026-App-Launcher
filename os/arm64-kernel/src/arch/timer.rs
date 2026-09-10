use core::arch::asm;
use core::sync::atomic::{AtomicU64, Ordering};

static TICKS: AtomicU64 = AtomicU64::new(0);

/// Read the architectural virtual counter. This is available on AArch64
/// platforms implementing the Arm Generic Timer architecture.
pub fn counter() -> u64 {
    let value: u64;
    unsafe { asm!("mrs {0}, cntvct_el0", out(reg) value, options(nomem, nostack, preserves_flags)); }
    value
}

/// Read the timer frequency advertised by the platform.
pub fn frequency() -> u64 {
    let value: u64;
    unsafe { asm!("mrs {0}, cntfrq_el0", out(reg) value, options(nomem, nostack, preserves_flags)); }
    value
}

/// Program the EL1 virtual timer to fire after `ticks` counter ticks.
pub fn arm(ticks: u64) {
    unsafe {
        asm!(
            "msr cntv_tval_el0, {0:w}",
            "msr cntv_ctl_el0, {1:w}",
            "isb",
            in(reg) ticks as u32,
            in(reg) 1u32,
            options(nomem, nostack, preserves_flags),
        );
    }
}

pub fn disarm() {
    unsafe { asm!("msr cntv_ctl_el0, wzr", "isb", options(nomem, nostack, preserves_flags)); }
}

pub fn tick() {
    TICKS.fetch_add(1, Ordering::Relaxed);
}

pub fn ticks() -> u64 {
    TICKS.load(Ordering::Relaxed)
}
