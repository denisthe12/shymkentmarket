# Finding #1 — status helper privilege boundary

Scope: source remediation of CWE-250, HIGH. Base main
`3c5e8cbc9f2c984808a158f243949e49b2a73cd5`. The read-only VPS audit confirmed that
the installed helper matched Git, the service UID could write checkout configuration,
and the helper had been invoked by root operators. The audit did not establish
historical exploitation.

The old sync section passed both checkout operations to the root command runner and
overrode Git's ownership check. The new `Host.checkout` resolves the fixed service
account, rejects a missing or zero/invalid identity, and launches both Git commands
through one separate path with UID/GID and explicitly empty supplementary groups
set by Python subprocess before exec. No shell or interactive stdin. Git runs by
absolute path with fixed arguments, a minimal environment and closed unrelated
descriptors. The command uses no optional locks, disables optional FSMonitor/hooks
settings, and has no safe.directory override. The security boundary is the
credential change before exec. Root-only report operations are intact.

The runner bounds stdout at 256 KiB and output/wait time with a monotonic 15-second
deadline. Failure/timeout discards output and cleans up the launch process group.
A legitimate revision is constrained to lowercase hex before rendering. An
unavailable checkout gives a bounded warning, with no root fallback, and the
remaining status sections continue. Result codes and healthy checkout output retain
their previous form. Git configuration is still controlled by the sync identity.
The report describes what that account sees and is not an attestation of checkout integrity.

Changed files: `ops/status/adilbaga_status.py`, `ops/status/adilbaga_status_test.py`,
`ops/status/README.md`, and this report. Team access, live sync and VPS configuration
are unchanged. No merge or deployment.

## Local verification

- Status unittest discovery: ordinary unprivileged run, 18 pass and one explicitly
  skipped root fixture. The portable tests assert fixed argv, credential options,
  closed descriptors, clean environment, no fallback, and report behavior. They
  exercise real bounded pipes and rejection paths with harmless subprocess output.
- The same suite in disposable Linux with network disabled, source bind-mounted
  read-only, and the root fixture enabled: 19 pass, zero skipped. The fixture
  measures real/effective UID/GID, supplementary groups and clean environment. It
  then inspects an ordinary fixture repo using real Git. Both HEAD and dirty count
  pass, and index bytes/mtime are unchanged.
- `python3 -m py_compile ops/status/adilbaga_status.py` and `git diff --check` passed.
- The final evidence report carries the hosted run and exact HEAD after publication.

## Separate release, after approval

Verify the approved/merged blob and its SHA256. Read back installed helper custody,
digest and root-owned parent. Stage only the reviewed Python file under root custody,
preserve the former file for incident evidence, and replace the installed helper
atomically after comparing the current inode/hash. Read back ownership, mode and
digest before any operator smoke. First qualify the privilege boundary locally on
a disposable Linux fixture. Then, during the separately approved install, perform
one normal status smoke and verify that the checkout result is available while
the Git children run as the expected service identity. Preserve human access and
sync state. If the replacement cannot be verified, stop and reconcile. Keep the
vulnerable backup out of the normal invocation path.
