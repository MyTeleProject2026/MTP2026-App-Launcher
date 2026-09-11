ENTRY(_start)

SECTIONS
{
  /* The flat guest image is loaded by the MTP2026 ARM64 executor at 0x400000. */
  . = 0x0000000000400000;

  .text : ALIGN(2048)
  {
    KEEP(*(.text._start))
    KEEP(*(.text.vectors))
    *(.text .text.*)
  }

  .rodata : ALIGN(8)
  {
    *(.rodata .rodata.*)
  }

  .data : ALIGN(8)
  {
    *(.data .data.*)
  }

  .bss : ALIGN(16)
  {
    *(.bss .bss.* COMMON)
  }

  /DISCARD/ :
  {
    *(.eh_frame*)
    *(.comment)
    *(.note*)
  }
}
