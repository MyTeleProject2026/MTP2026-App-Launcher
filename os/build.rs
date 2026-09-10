use std::path::PathBuf;

fn main() {
    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo did not provide OUT_DIR"));
    let kernel = PathBuf::from(
        std::env::var_os("CARGO_BIN_FILE_KERNEL_kernel")
            .expect("kernel artifact dependency was not built"),
    );

    let uefi_path = out_dir.join("mtp2026-uefi.img");
    bootloader::UefiBoot::new(&kernel)
        .create_disk_image(&uefi_path)
        .expect("failed to create MTP2026 UEFI image");

    let bios_path = out_dir.join("mtp2026-bios.img");
    bootloader::BiosBoot::new(&kernel)
        .create_disk_image(&bios_path)
        .expect("failed to create MTP2026 BIOS image");

    println!("cargo:rustc-env=MTP2026_UEFI_IMAGE={}", uefi_path.display());
    println!("cargo:rustc-env=MTP2026_BIOS_IMAGE={}", bios_path.display());
    println!("cargo:rerun-if-changed=kernel/src");
}
