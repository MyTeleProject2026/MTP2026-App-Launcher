#![no_std]
#![no_main]
#![feature(abi_x86_interrupt)]

use bootloader_api::{entry_point, BootInfo};
use core::fmt::Write;
use uart_16550::{backend::PioBackend, Config, Uart16550Tty};
use x86_64::instructions::{hlt, nop, port::Port};

mod arch;
mod scheduler;
mod syscall;
mod timer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum QemuExitCode { Success = 0x10, Failed = 0x11 }

type SerialPort = Uart16550Tty<PioBackend>;

fn serial() -> SerialPort {
    unsafe { SerialPort::new_port(0x3F8, Config::default()).expect("failed to initialize UART") }
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
    writeln!(serial, "Usable memory : {} MiB", arch::x86_64::memory::total_usable_bytes(&boot_info.memory_regions) / (1024 * 1024)).ok();
    writeln!(serial, "Framebuffer   : {:?}", boot_info.framebuffer).ok();

    arch::x86_64::frame_allocator::init(&boot_info.memory_regions);
    let first_frame = arch::x86_64::frame_allocator::allocate_frame();
    arch::x86_64::interrupts::init();
    let first_thread = scheduler::create_kernel_thread();
    scheduler::schedule(first_thread);
    timer::tick();

    writeln!(serial, "Frame allocator: {} usable regions", arch::x86_64::frame_allocator::region_count()).ok();
    match first_frame {
        Some(frame) => writeln!(serial, "First free frame: {:#x}", frame).ok(),
        None => writeln!(serial, "First free frame: none").ok(),
    };
    writeln!(serial, "Interrupts    : IDT loaded and enabled").ok();
    writeln!(serial, "Scheduler     : kernel thread {} ready", scheduler::current_thread()).ok();
    writeln!(serial, "Timer ticks   : {}", timer::ticks()).ok();
    writeln!(serial, "Syscall ABI   : yield=0 ticks=1 console=2").ok();
    writeln!(serial, "----------------------------------------").ok();
    writeln!(serial, "MTP2026 kernel initialization complete.").ok();
    writeln!(serial, "Kernel alive: memory + frame allocator + interrupts + scheduler + timer + syscall ABI").ok();
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
