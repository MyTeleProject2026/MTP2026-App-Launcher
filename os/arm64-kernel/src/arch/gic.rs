#![allow(dead_code)]

use core::ptr::{read_volatile, write_volatile};

/// Minimal GICv3 distributor interface. Physical addresses come from the
/// platform boot contract; no phone-specific MMIO address is hard-coded.
pub struct Gicv3 {
    gicd_base: u64,
    gicr_base: u64,
}

impl Gicv3 {
    pub const unsafe fn from_boot_contract(gicd_base: u64, gicr_base: u64) -> Option<Self> {
        if gicd_base == 0 || gicr_base == 0 {
            None
        } else {
            Some(Self { gicd_base, gicr_base })
        }
    }

    pub const fn distributor_base(&self) -> u64 { self.gicd_base }
    pub const fn redistributor_base(&self) -> u64 { self.gicr_base }

    /// Read GICD_TYPER to identify the implemented interrupt lines.
    pub fn typer(&self) -> u32 {
        unsafe { read_volatile(self.gicd_base as *const u32) }
    }

    /// Disable the distributor before a complete interrupt configuration is installed.
    pub unsafe fn disable_distributor(&self) {
        const GICD_CTLR: u64 = 0x000;
        write_volatile((self.gicd_base + GICD_CTLR) as *mut u32, 0);
    }

    /// Enable Group 1 Non-secure interrupts after redistributor/CPU interface setup.
    /// This deliberately does not enable IRQs by itself.
    pub unsafe fn enable_group1(&self) {
        const GICD_CTLR: u64 = 0x000;
        const ENABLE_G1NS: u32 = 1 << 1;
        write_volatile((self.gicd_base + GICD_CTLR) as *mut u32, ENABLE_G1NS);
    }
}

pub fn from_boot_info(gicd_base: u64, gicr_base: u64) -> Option<Gicv3> {
    unsafe { Gicv3::from_boot_contract(gicd_base, gicr_base) }
}
