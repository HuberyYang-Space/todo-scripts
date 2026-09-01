"""Run a command attached to a real pty, so interactive prompts can be driven by a test.

Usage: python3 pty-driver.py <rows> <cols> <command> [args...]

Keystrokes written to this process's stdin are forwarded to the pty; everything the
child writes comes back on stdout. Exits with the child's exit code.

Why not the obvious alternatives:

- BSD `script(1)` (macOS) calls tcgetattr on its OWN stdin and aborts with
  "tcgetattr/ioctl: Operation not supported on socket" when that is a pipe, which it
  always is under a test runner.
- `pty.spawn()` gives no way to set the window size, and a pty defaults to 0 columns.
  A zero-width terminal wraps after every single character, so the child's output
  arrives one character per line and no assertion on it can ever match.

Only stdlib is used, so this needs no dependency and works with the python3 that
ships with macOS and virtually every Linux distro.
"""

import fcntl
import os
import pty
import select
import struct
import sys
import termios


def main() -> int:
    rows, cols = int(sys.argv[1]), int(sys.argv[2])
    argv = sys.argv[3:]

    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    pid = os.fork()
    if pid == 0:
        os.close(master)
        # New session + controlling terminal, so the child sees a genuine tty
        os.setsid()
        try:
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        except OSError:
            pass
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)
        os.execvp(argv[0], argv)
        os._exit(127)

    os.close(slave)
    stdin_open = True
    try:
        while True:
            watch = [master] + ([0] if stdin_open else [])
            ready, _, _ = select.select(watch, [], [], 0.1)

            if master in ready:
                try:
                    data = os.read(master, 4096)
                except OSError:
                    break  # EIO: the child is gone and the slave side closed
                if not data:
                    break
                os.write(1, data)

            if stdin_open and 0 in ready:
                try:
                    data = os.read(0, 4096)
                except OSError:
                    data = b""
                if data:
                    os.write(master, data)
                else:
                    stdin_open = False
    finally:
        os.close(master)

    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


if __name__ == "__main__":
    sys.exit(main())
