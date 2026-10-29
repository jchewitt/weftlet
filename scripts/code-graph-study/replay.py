"""Replay a recorded matrix's completed runs after an explicitly sealed harness correction.

No extractor runs. Original outputs stay immutable; only scoring/projection/queries repeat.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import time
from run import git, hashes, write_json

parser = argparse.ArgumentParser()
parser.add_argument('--measurement', required=True)
parser.add_argument('--receipt', required=True)
args = parser.parse_args()
original = pathlib.Path(args.measurement).resolve()
workspace = original.parent
repo = pathlib.Path(__file__).resolve().parents[2]
receipt = json.loads(pathlib.Path(args.receipt).read_text())
assert git(repo, 'rev-parse', 'HEAD').decode().strip() == receipt['harnessCommit']
assert not git(repo, 'status', '--porcelain', '--', 'scripts/code-graph-study').strip()
previous = json.loads((original / 'runs.json').read_text())
root = workspace / f"replay-{receipt['harnessCommit'][:12]}"
root.mkdir(exist_ok=False)
write_json(root / 'receipt.json', receipt)
environment = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    environment.pop(key, None)
docker = ['docker', '--host=unix:///var/run/docker.sock']
started = time.monotonic()
records = []
original_hashes = hashes(original)
for record in previous['runs']:
    assert record['status'] == 'complete'
    old_output = original / record['output']
    case = root / old_output.parent.name
    output = case / 'output'
    output.mkdir(parents=True)
    spec = json.loads((old_output.parent / 'spec.json').read_text())
    for name in ['baseline.snapshot.json', 'scip.raw.json', 'graphify.raw.json']:
        shutil.copy2(old_output / name, output / name)
    spec['output'] = '/study/' + output.relative_to(workspace).as_posix()
    store = root / 'arm-store' / f"{record['sample']}-{record['corpus']}"
    store.mkdir(parents=True, exist_ok=True)
    old_store = hashes(store)
    spec['armStore'] = '/study/' + store.relative_to(workspace).as_posix()
    spec_path = case / 'spec.json'
    write_json(spec_path, spec)
    command = list(record['execution']['assembly']['command'])
    name = f"weftlet-study-replay-{os.getpid()}-{len(records)}"
    command[command.index('--name') + 1] = name
    metrics_index = command.index('/harness/supervise.py') + 1
    command[metrics_index] = spec['output'] + '/assembly.metrics.json'
    remaining = 1800 - receipt['priorMeasurementSeconds'] - (time.monotonic() - started)
    assert remaining > 0, 'Global measurement budget exhausted'
    budget = min(120, remaining)
    command[metrics_index + 1] = str(budget)
    command[-1] = '/study/' + spec_path.relative_to(workspace).as_posix()
    before = time.monotonic()
    try:
        with (output / 'assembly.log').open('w') as log:
            process = subprocess.run(command, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=budget + 10)
        state = json.loads(subprocess.check_output(docker + ['inspect', name], env=environment))[0]['State']
    finally:
        subprocess.run(docker + ['rm', '-f', name], env=environment, stdout=subprocess.DEVNULL, check=True)
    execution = {'exitCode': process.returncode, 'oomKilled': state['OOMKilled'],
                 'containerWallSeconds': time.monotonic() - before,
                 'metrics': json.loads((output / 'assembly.metrics.json').read_text()), 'command': command}
    write_json(output / 'assembly.execution.json', execution)
    assert process.returncode == 0, f'Replay failed; retained {output}'
    after = hashes(store)
    assert all(after.get(path) == value for path, value in old_store.items()), 'Historical evidence changed'
    records.append({'sample': record['sample'], 'corpus': record['corpus'], 'scenario': record['scenario'],
                    'originalOutput': record['output'], 'output': str(output.relative_to(root)),
                    'historicalArtifactsPreserved': len(old_store), 'artifactHashes': hashes(output), 'execution': execution})
    write_json(root / 'replays.json', {'seconds': time.monotonic() - started,
               'cumulativeMeasurementSeconds': receipt['priorMeasurementSeconds'] + time.monotonic() - started, 'runs': records})
    print(json.dumps({key: record[key] for key in ['sample', 'corpus', 'scenario']}), flush=True)
assert hashes(original) == original_hashes, 'Replay changed original measurement'
print(json.dumps({'originalMeasurementUnchanged': True, 'replayed': len(records)}), flush=True)
