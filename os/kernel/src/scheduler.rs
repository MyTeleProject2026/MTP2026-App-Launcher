use core::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThreadState {
    Ready,
    Running,
    Blocked,
}

#[derive(Clone, Copy, Debug)]
pub struct ThreadSlot {
    pub id: u64,
    pub state: ThreadState,
}

static NEXT_THREAD_ID: AtomicU64 = AtomicU64::new(1);
static CURRENT_THREAD_ID: AtomicU64 = AtomicU64::new(0);

pub fn create_kernel_thread() -> ThreadSlot {
    let id = NEXT_THREAD_ID.fetch_add(1, Ordering::Relaxed);
    ThreadSlot { id, state: ThreadState::Ready }
}

pub fn schedule(thread: ThreadSlot) {
    if thread.state == ThreadState::Ready {
        CURRENT_THREAD_ID.store(thread.id, Ordering::Release);
    }
}

pub fn current_thread() -> u64 {
    CURRENT_THREAD_ID.load(Ordering::Acquire)
}
