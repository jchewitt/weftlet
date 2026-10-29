"""Container-local watchdog; Docker separately enforces cgroup memory and no networking."""
import json
import pathlib
import os
import subprocess
import sys
import time

output, seconds, *command = sys.argv[1:]
started = time.monotonic()
phase_file = pathlib.Path(output).with_suffix('.phase.json')
environment = dict(os.environ, WEFTLET_STUDY_PHASE_FILE=str(phase_file))
child = subprocess.Popen(command, env=environment)
peak_rss = 0
timed_out = False
phase = None
phase_started = started
phase_budget = float(seconds)
artifact_limit = False
while child.poll() is None:
    rss = 0
    for path in pathlib.Path('/proc').glob('[0-9]*/status'):
        try:
            for line in path.read_text().splitlines():
                if line.startswith('VmRSS:'):
                    rss += int(line.split()[1]) * 1024
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
    peak_rss = max(peak_rss, rss)
    if phase_file.exists():
        try:
            value = json.loads(phase_file.read_text())
            if value != phase:
                phase, phase_started = value, time.monotonic()
                phase_budget = min(float(seconds), float(value['budgetSeconds']))
        except (ValueError, KeyError):
            pass  # The worker may be replacing this small progress file.
    size = sum(path.stat().st_size for path in pathlib.Path(output).parent.rglob('*') if path.is_file())
    artifact_limit = size > 67108864
    if time.monotonic() - started > float(seconds) or time.monotonic() - phase_started > phase_budget or artifact_limit:
        timed_out = True
        child.kill()
        break
    time.sleep(0.01)
code = child.wait()
metrics = {
    'seconds': time.monotonic() - started, 'exitCode': code, 'timedOut': timed_out,
    'lastPhase': phase, 'artifactLimitExceeded': artifact_limit,
    'processTreePeakRssSampledBytes': peak_rss, 'rssSampleIntervalMs': 10,
    'rssIncludesSupervisor': True,
    'cgroupMemoryPeakBytes': int(pathlib.Path('/sys/fs/cgroup/memory.peak').read_text()),
    'cgroupMemoryLimitBytes': int(pathlib.Path('/sys/fs/cgroup/memory.max').read_text()),
    'memoryEvents': pathlib.Path('/sys/fs/cgroup/memory.events').read_text(),
}
pathlib.Path(output).write_text(json.dumps(metrics, indent=2) + '\n')
sys.exit(124 if timed_out else code)
