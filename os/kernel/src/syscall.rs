#[repr(u64)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Syscall {
    Yield = 0,
    GetTicks = 1,
    WriteConsole = 2,
}

pub const SYS_YIELD: u64 = Syscall::Yield as u64;
pub const SYS_GET_TICKS: u64 = Syscall::GetTicks as u64;
pub const SYS_WRITE_CONSOLE: u64 = Syscall::WriteConsole as u64;

pub fn dispatch(number: u64, _arg0: u64, _arg1: u64, _arg2: u64) -> u64 {
    match number {
        SYS_YIELD => 0,
        SYS_GET_TICKS => crate::timer::ticks(),
        SYS_WRITE_CONSOLE => 0,
        _ => u64::MAX,
    }
}
