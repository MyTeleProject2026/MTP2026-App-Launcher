ENTRY(_start)

SECTIONS
{
  . = 0x0000000000000000;

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
