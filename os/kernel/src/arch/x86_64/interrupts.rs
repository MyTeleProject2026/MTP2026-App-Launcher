use spin::Once;
use x86_64::instructions::interrupts;
use x86_64::structures::idt::{InterruptDescriptorTable, InterruptStackFrame};

static IDT: Once<InterruptDescriptorTable> = Once::new();

extern "x86-interrupt" fn breakpoint(_stack: InterruptStackFrame) {}

extern "x86-interrupt" fn double_fault(
    _stack: InterruptStackFrame,
    _error: u64,
) -> ! {
    loop { x86_64::instructions::hlt(); }
}

pub fn init() {
    IDT.call_once(|| {
        let mut idt = InterruptDescriptorTable::new();
        idt.breakpoint.set_handler_fn(breakpoint);
        idt.double_fault.set_handler_fn(double_fault);
        idt
    }).load();
    interrupts::enable();
}
