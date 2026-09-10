use bootloader_api::info::{MemoryRegionKind, MemoryRegions};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PhysicalRegion {
    pub start: u64,
    pub end: u64,
}

impl PhysicalRegion {
    pub const fn len(self) -> u64 { self.end.saturating_sub(self.start) }
}

pub fn usable_regions(regions: &MemoryRegions) -> impl Iterator<Item = PhysicalRegion> + '_ {
    regions.iter().filter_map(|region| {
        if region.kind != MemoryRegionKind::Usable { return None; }
        Some(PhysicalRegion {
            start: region.start,
            end: region.end,
        })
    })
}

pub fn total_usable_bytes(regions: &MemoryRegions) -> u64 {
    usable_regions(regions).map(PhysicalRegion::len).sum()
}
