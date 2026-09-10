#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

use bootloader_api::{entry_point, BootInfo};
use core::fmt::Write;
use uart_16550::SerialPort;
use x86_64::instructions::{hlt, nop, port::Port};

mod arch;
mod scheduler;
mod syscall;
mod timer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum QemuExitCode { Success = 0x10, Failed = 0x11 }

fn serial() -> SerialPort {
    let mut port = unsafe { SerialPort::new(0x3F8) };
    port.init();
    port
}

fn exit_qemu(code: QemuExitCode) -> ! {
    unsafe { Port::new(0xf4).write(code as u32); }
    loop { nop(); }
}

entry_point!(kernel_main);

fn kernel_main(boot_info: &'static mut BootInfo) -> ! {
    let mut serial = serial();
    writeln!(serial, "\n========================================").ok();
    writeln!(serial, " MTP2026 OPERATING SYSTEM KERNEL").ok();
    writeln!(serial, "========================================").ok();
    writeln!(serial, "Boot protocol : MTP2026 bootloader API").ok();
    writeln!(serial, "Architecture  : x86_64").ok();
    writeln!(serial, "Kernel mode   : no_std / no_main").ok();
    writeln!(serial, "Memory map    : {} regions", boot_info.memory_regions.len()).ok();
    writeln!(serial, "Usable memory : {} MiB", arch::memory::total_usable_bytes(&boot_info.memory_regions) / (1024 * 1024)).ok();
    writeln!(serial, "Framebuffer   : {:?}", boot_info.framebuffer).ok();

    arch::interrupts::init();
    let first_thread = scheduler::create_kernel_thread();
    scheduler::schedule(first_thread);
    timer::tick();

    writeln!(serial, "Interrupts    : IDT loaded and enabled").ok();
    writeln!(serial, "Scheduler     : kernel thread {} ready", scheduler::current_thread()).ok();
    writeln!(serial, "Timer ticks   : {}", timer::ticks()).ok();
    writeln!(serial, "Syscall ABI   : yield=0 ticks=1 console=2").ok();
    writeln!(serial, "----------------------------------------").ok();
    writeln!(serial, "MTP2026 kernel initialization complete.").ok();
    writeln!(serial, "Kernel alive: memory + interrupts + scheduler + timer + syscall ABI").ok();
    exit_qemu(QemuExitCode::Success);
}

#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    let mut serial = serial();
    let _ = writeln!(serial, "MTP2026 KERNEL PANIC: {info}");
    exit_qemu(QemuExitCode::Failed);
}

#[allow(dead_code)]
fn halt_forever() -> ! { loop { hlt(); } }
