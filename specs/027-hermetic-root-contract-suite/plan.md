# Implementation Plan: Hermetic Root Contract Suite

**Spec**: [spec.md](./spec.md)

1. Add a root package and dependency-free Node bootstrap that runs the locked Function dependency install in `api/`. Keep the VM's Node 24 suite as its own package command.
2. Add shared Python and Obscura resolver helpers.
3. Repair the URL path conversion and replace hard-coded `python3` launchers.
4. Gate the three browser tests before their servers start.
5. Add Windows and provisioned-browser CI jobs, then document the identical local flow.
