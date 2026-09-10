#![allow(dead_code)]

use core::mem::size_of;
use x86_64::structures::idt::InterruptDescriptorTable;
use x86_64::instructions::interrupts;

static mut IDT: Option<InterruptDescriptorTable> = None;

extern "x86-interrupt" fn breakpoint(_stack: x86_64::structures::idt::InterruptStackFrame) {}

extern "x86-interrupt" fn double_fault(
    _stack: x86_64::structures::idt::InterruptStackFrame,
    _error: u64,
) -> ! {
    loop { x86_64::instructions::hlt(); }
}

pub fn init() {
    let mut idt = InterruptDescriptorTable::new();
    idt.breakpoint.set_handler_fn(breakpoint);
    unsafe {
        idt.double_fault.set_handler_fn(double_fault);
        IDT = Some(idt);
        IDT.as_ref().unwrap().load();
    }
    interrupts::enable();
}

pub const IDT_ENTRY_SIZE: usize = size_of::<x86_64::structures::idt::Entry<()>>();
