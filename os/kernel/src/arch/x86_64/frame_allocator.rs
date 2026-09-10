use bootloader_api::info::MemoryRegions;
use spin::Mutex;

use super::memory::{usable_regions, PhysicalRegion};

pub const PAGE_SIZE: u64 = 4096;
const MAX_USABLE_REGIONS: usize = 128;

#[derive(Clone, Copy)]
struct FrameAllocatorState {
    regions: [PhysicalRegion; MAX_USABLE_REGIONS],
    count: usize,
    next_region: usize,
    next_frame: u64,
}

impl FrameAllocatorState {
    const EMPTY: PhysicalRegion = PhysicalRegion { start: 0, end: 0 };

    const fn new() -> Self {
        Self {
            regions: [Self::EMPTY; MAX_USABLE_REGIONS],
            count: 0,
            next_region: 0,
            next_frame: 0,
        }
    }

    fn reset(&mut self, regions: &MemoryRegions) {
        *self = Self::new();
        for region in usable_regions(regions) {
            if self.count == MAX_USABLE_REGIONS { break; }
            let start = align_up(region.start, PAGE_SIZE);
            let end = align_down(region.end, PAGE_SIZE);
            if start < end {
                self.regions[self.count] = PhysicalRegion { start, end };
                self.count += 1;
            }
        }
        if self.count > 0 { self.next_frame = self.regions[0].start; }
    }

    fn allocate(&mut self) -> Option<u64> {
        while self.next_region < self.count {
            let region = self.regions[self.next_region];
            if self.next_frame < region.end {
                let frame = self.next_frame;
                self.next_frame = self.next_frame.saturating_add(PAGE_SIZE);
                return Some(frame);
            }
            self.next_region += 1;
            if self.next_region < self.count {
                self.next_frame = self.regions[self.next_region].start;
            }
        }
        None
    }
}

static STATE: Mutex<FrameAllocatorState> = Mutex::new(FrameAllocatorState::new());

pub fn init(regions: &MemoryRegions) { STATE.lock().reset(regions); }
pub fn allocate_frame() -> Option<u64> { STATE.lock().allocate() }
pub fn region_count() -> usize { STATE.lock().count }

const fn align_up(value: u64, align: u64) -> u64 {
    (value.saturating_add(align - 1)) & !(align - 1)
}

const fn align_down(value: u64, align: u64) -> u64 {
    value & !(align - 1)
}
