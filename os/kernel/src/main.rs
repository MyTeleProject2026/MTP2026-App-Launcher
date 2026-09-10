#![no_std]
#![no_main]

use bootloader_api::{entry_point, BootInfo};
use core::fmt::Write;
use uart_16550::SerialPort;
use x86_64::instructions::{nop, port::Port};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum QemuExitCode {
    Success = 0x10,
    Failed = 0x11,
}

fn serial() -> SerialPort {
    let mut port = unsafe { SerialPort::new(0x3F8) };
    port.init();
    port
}

fn exit_qemu(code: QemuExitCode) -> ! {
    unsafe {
        let mut port = Port::new(0xf4);
        port.write(code as u32);
    }

    loop {
        nop();
    }
}

entry_point!(kernel_main);

fn kernel_main(boot_info: &'static mut BootInfo) -> ! {
    let mut serial = serial();

    writeln!(serial, "").ok();
    writeln!(serial, "========================================").ok();
    writeln!(serial, " MTP2026 OPERATING SYSTEM KERNEL").ok();
    writeln!(serial, "========================================").ok();
    writeln!(serial, "Boot protocol : MTP2026 bootloader API").ok();
    writeln!(serial, "Architecture  : x86_64").ok();
    writeln!(serial, "Kernel mode   : no_std / no_main").ok();
    writeln!(serial, "Memory map    : {} regions", boot_info.memory_regions.len()).ok();
    writeln!(serial, "Framebuffer   : {:?}", boot_info.framebuffer).ok();
    writeln!(serial, "Kernel image  : {:#x} bytes", boot_info.kernel_len).ok();
    writeln!(serial, "Kernel stack  : {:#x} bytes", boot_info.kernel_stack_len).ok();
    writeln!(serial, "----------------------------------------").ok();
    writeln!(serial, "Kernel initialization complete.").ok();
    writeln!(serial, "Next layers: memory manager, interrupts, scheduler, drivers, VFS, userspace.").ok();
    writeln!(serial, "MTP2026 kernel is alive.").ok();

    exit_qemu(QemuExitCode::Success);
}

#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    let mut serial = serial();
    let _ = writeln!(serial, "MTP2026 KERNEL PANIC: {info}");
    exit_qemu(QemuExitCode::Failed);
}
