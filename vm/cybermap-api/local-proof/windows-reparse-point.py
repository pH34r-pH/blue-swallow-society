#!/usr/bin/env python
"""Emit a single stable bit for a Windows path's FILE_ATTRIBUTE_REPARSE_POINT state."""

import ctypes
import sys

FILE_ATTRIBUTE_REPARSE_POINT = 0x0400
INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
    kernel32.GetFileAttributesW.restype = ctypes.c_uint32
    attributes = kernel32.GetFileAttributesW(sys.argv[1])
    if attributes == INVALID_FILE_ATTRIBUTES:
        return 3
    sys.stdout.write('1\n' if attributes & FILE_ATTRIBUTE_REPARSE_POINT else '0\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
