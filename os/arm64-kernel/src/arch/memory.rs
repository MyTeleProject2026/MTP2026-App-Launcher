#![allow(dead_code)]

pub const PAGE_SIZE: u64 = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PhysicalRange {
    pub start: u64,
    pub end: u64,
}

impl PhysicalRange {
    pub const fn len(self) -> u64 {
        self.end.saturating_sub(self.start)
    }
}

pub const fn align_down(value: u64) -> u64 {
    value & !(PAGE_SIZE - 1)
}

pub const fn align_up(value: u64) -> u64 {
    value.saturating_add(PAGE_SIZE - 1) & !(PAGE_SIZE - 1)
}

/// Validate and page-align the physical memory supplied by the platform boot
/// contract. The actual phone/QEMU memory map will later be populated from
/// the device tree or firmware memory descriptors.
pub fn boot_memory(base: u64, size: u64) -> Option<PhysicalRange> {
    let end = base.checked_add(size)?;
    let start = align_up(base);
    let end = align_down(end);
    (start < end).then_some(PhysicalRange { start, end })
}

pub fn page_count(range: PhysicalRange) -> u64 {
    range.len() / PAGE_SIZE
}
