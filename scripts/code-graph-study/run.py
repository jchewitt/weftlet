"""Linux/Docker experiment driver. Inputs are Git blobs; workers run offline under cgroup limits."""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import time


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    pathlib.Path(path).write_text(json.dumps(value, indent=2) + '\n')


def git(root, *args):
    return subprocess.check_output(['git', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', *args], cwd=root)


def commit(root, message):
    environment = dict(os.environ, GIT_AUTHOR_DATE='2026-10-29T00:00:00Z', GIT_COMMITTER_DATE='2026-10-29T00:00:00Z')
    git(root, 'add', '.')
    subprocess.run(['git', '-c', 'user.name=Public Code Study', '-c', 'user.email=study@example.invalid',
                    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message], cwd=root, env=environment, check=True)
    return git(root, 'rev-parse', 'HEAD').decode().strip()


def hashes(root):
    return {path.relative_to(root).as_posix(): sha(path.read_bytes()) for path in sorted(root.rglob('*')) if path.is_file()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--samples', type=int, default=3, choices=[1, 2, 3])
    args = parser.parse_args()
    workspace = pathlib.Path(args.workspace).resolve()
    repo = pathlib.Path(__file__).resolve().parents[2]
    receipt = json.loads(pathlib.Path(args.receipt).read_text())
    harness = repo / 'scripts/code-graph-study'
    assert git(repo, 'rev-parse', 'HEAD').decode().strip() == receipt['harnessCommit'], 'Seal the harness commit before measuring'
    assert not git(repo, 'status', '--porcelain', '--', str(harness)).strip(), 'Dirty harness'
    freeze = receipt['freezeCommit']
    def blob(path):
        return git(repo, 'show', f'{freeze}:{path}')
    protocol = json.loads(blob('evaluations/code-graph/protocol.json'))
    lock = json.loads(blob('evaluations/code-graph/inputs.lock.json'))
    assert lock['digest'] == receipt['freezeDigest']
    inputs = {item['path']: blob(item['path']) for item in lock['inputs']}
    assert all(sha(inputs[item['path']]) == item['sha256'] for item in lock['inputs'])
    assert sha((workspace / 'baseline/pnpm-lock.yaml').read_bytes()) == receipt['baselineLockSha256']
    assert sha((workspace / 'upstream/Graphify-Labs-graphify-0a8cd4e/uv.lock').read_bytes()) == protocol['arms'][2]['lockSha256']
    image = receipt['runtimeImageId']
    assert image.startswith('sha256:')
    output_root = workspace / f"measurement-{receipt['harnessCommit'][:12]}"
    output_root.mkdir(exist_ok=False)
    write_json(output_root / 'receipt.json', receipt)
    (output_root / 'cases.json').write_bytes(inputs['evaluations/code-graph/cases.json'])
    environment = os.environ.copy()
    for name in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
        environment.pop(name, None)
    docker = ['docker', '--host=unix:///var/run/docker.sock']
    started = time.monotonic()
    results = []
    counter = 0
    def container_path(path):
        return '/study/' + pathlib.Path(path).relative_to(workspace).as_posix()

    def run_worker(spec_path, phase, command):
        nonlocal counter
        counter += 1
        spec = json.loads(spec_path.read_text())
        output = workspace / spec['output'].removeprefix('/study/')
        name = f'weftlet-study-{os.getpid()}-{counter}'
        remaining = protocol['bounds']['totalMeasurementSeconds'] - (time.monotonic() - started)
        if remaining <= 0:
            return {'status': 'global-budget-exhausted'}
        budget = min(protocol['bounds']['extractionSeconds'], remaining)
        metrics = output / f'{phase}.metrics.json'
        cmd = docker + ['run', '--name', name, '--user', '1000:1000', '--read-only', '--network=none',
                        '--memory=2147483648', '--memory-swap=2147483648', '--cpus=2', '--pids-limit=128',
                        '--tmpfs', '/tmp:rw,nosuid,size=128m,mode=1777',
                        '--mount', f'type=bind,src={workspace},dst=/study',
                        '--mount', f'type=bind,src={workspace}/baseline,dst=/study/baseline,readonly',
                        '--mount', f'type=bind,src={workspace}/upstream,dst=/study/upstream,readonly',
                        '--mount', f'type=bind,src={workspace}/graphify-venv,dst=/study/graphify-venv,readonly',
                        '--mount', f'type=bind,src={harness},dst=/harness,readonly',
                        '--mount', f'type=bind,src={receipt["nodeBinary"]},dst=/usr/local/bin/node,readonly',
                        '-e', 'PYTHONDONTWRITEBYTECODE=1', '-e', 'NODE_OPTIONS=--max-old-space-size=1536',
                        image, '/usr/local/bin/python', '/harness/supervise.py', container_path(metrics), str(budget),
                        *command, container_path(spec_path)]
        before = time.monotonic()
        with (output / f'{phase}.log').open('w') as log:
            try:
                process = subprocess.run(cmd, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=budget + 10)
                exit_code = process.returncode
            except subprocess.TimeoutExpired:
                subprocess.run(docker + ['kill', name], env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                exit_code = 124
        state = json.loads(subprocess.check_output(docker + ['inspect', name], env=environment))[0]['State']
        subprocess.run(docker + ['rm', '-f', name], env=environment, stdout=subprocess.DEVNULL, check=True)
        details = json.loads(metrics.read_text()) if metrics.exists() else None
        result = {'status': 'complete' if exit_code == 0 else 'failed', 'exitCode': exit_code,
                  'containerWallSeconds': time.monotonic() - before, 'oomKilled': state['OOMKilled'], 'metrics': details,
                  'command': cmd}
        if details and details['cgroupMemoryLimitBytes'] != protocol['bounds']['processTreeMemoryBytes']:
            raise RuntimeError('Memory enforcement differs from frozen budget')
        write_json(output / f'{phase}.execution.json', result)
        return result

    def prepare(corpus, case_dir, scenario):
        consumer = case_dir / 'consumer'
        consumer.mkdir(parents=True)
        files = {path[len(corpus['root']) + 1:]: data for path, data in inputs.items() if path.startswith(corpus['root'] + '/')}
        files.update({support['to']: inputs[support['from']] for support in corpus['materializeSupport']})
        for path, data in files.items():
            target = consumer / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        git(consumer, 'init', '--quiet')
        git(consumer, 'config', 'core.autocrlf', 'false')
        base = commit(consumer, 'Frozen public code-study input')
        for change in scenario['operations']:
            target = consumer / change['path']
            if change['kind'] == 'replace':
                text = target.read_text()
                assert text.count(change['before']) == 1
                target.write_text(text.replace(change['before'], change['after']))
            elif change['kind'] == 'delete':
                target.unlink()
            else:
                destination = consumer / change['to']
                assert not destination.exists()
                target.rename(destination)
        if scenario['id'] == 'omitted-project':
            config_path = consumer / 'context-graph.config.json'
            config = json.loads(config_path.read_text())
            config['codeRoots'] = [path for path in corpus['expectedProjects'] if path not in scenario['excludedProjects']] + ['tests']
            config['scip']['sourceProject']['include'] = [f'{path}/**/*.ts' for path in config['codeRoots']] + ['apps/**/*.tsx']
            write_json(config_path, config)
        head = base if scenario['id'] in ['cold', 'dirty'] else commit(consumer, f"Public variant: {scenario['id']}")
        tracked = git(consumer, 'ls-tree', '-rz', '--name-only', head).decode().strip('\0').split('\0')
        isolated = case_dir / 'committed'
        isolated.mkdir()
        for path in tracked:
            target = isolated / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(git(consumer, 'show', f'{head}:{path}'))
        excluded = scenario.get('excludedProjects', [])
        selected = [path for path in tracked if path.endswith(('.ts', '.tsx')) and not any(path.startswith(project + '/') for project in excluded)]
        return consumer, isolated, head, tracked, selected

    cold_scenario = next(value for value in protocol['scenarios'] if value['id'] == 'cold')
    for sample in range(1, args.samples + 1):
        for corpus in protocol['corpora']:
            cold_state = None
            for scenario in protocol['scenarios']:
                if scenario['corpus'] not in ['all', corpus['id']]:
                    continue
                if time.monotonic() - started >= protocol['bounds']['totalMeasurementSeconds']:
                    results.append({'sample': sample, 'corpus': corpus['id'], 'scenario': scenario['id'], 'status': 'global-budget-exhausted'})
                    continue
                case_dir = output_root / f'{sample}-{corpus["id"]}-{scenario["id"]}'
                case_dir.mkdir()
                output = case_dir / 'output'
                output.mkdir()
                if scenario['id'] == 'repeat':
                    consumer, isolated, head, tracked, selected, cache, arm_store = cold_state
                else:
                    consumer, isolated, head, tracked, selected = prepare(corpus, case_dir, scenario)
                    cache, arm_store = case_dir / 'graphify-cache', case_dir / 'arm-store'
                    cache.mkdir()
                    arm_store.mkdir()
                    if scenario['id'] != 'cold' and cold_state:
                        shutil.copytree(cold_state[0] / '.context-graph', consumer / '.context-graph', dirs_exist_ok=True)
                        shutil.copytree(cold_state[5], cache, dirs_exist_ok=True)
                        shutil.copytree(cold_state[6], arm_store, dirs_exist_ok=True)
                    if scenario['id'] == 'cold':
                        cold_state = (consumer, isolated, head, tracked, selected, cache, arm_store)
                historical = hashes(arm_store)
                isolated_before = hashes(isolated)
                dirty = git(consumer, 'status', '--porcelain').decode().splitlines()
                spec = {'baseline': '/study/baseline', 'graphifySource': '/study/upstream/Graphify-Labs-graphify-0a8cd4e',
                        'consumerRoot': container_path(consumer), 'isolatedRoot': container_path(isolated), 'commit': head,
                        'selectedFiles': selected, 'allFiles': tracked, 'output': container_path(output),
                        'graphifyCache': container_path(cache), 'armStore': container_path(arm_store),
                        'cases': container_path(output_root / 'cases.json'), 'corpus': corpus, 'scenario': scenario,
                        'bounds': protocol['bounds'], 'excludedWorkingChanges': dirty,
                        'legacyCases': json.loads(inputs[corpus['legacyCases']]) if corpus.get('legacyCases') else None}
                spec_path = case_dir / 'spec.json'
                write_json(spec_path, spec)
                executions = {}
                for phase, command in [('scip', ['node', '/harness/scip-worker.mjs']),
                                       ('graphify', ['/study/graphify-venv/bin/python', '/harness/graphify-worker.py']),
                                       ('assembly', ['node', '/harness/assemble.mjs'])]:
                    executions[phase] = run_worker(spec_path, phase, command)
                    if executions[phase]['status'] != 'complete':
                        break
                after = hashes(arm_store)
                assert all(after.get(path) == value for path, value in historical.items()), 'Historical evidence changed'
                assert hashes(isolated) == isolated_before, 'Extractor changed committed input bytes'
                assert git(consumer, 'status', '--porcelain').decode().splitlines() == dirty, 'Active checkout changed'
                record = {'sample': sample, 'corpus': corpus['id'], 'scenario': scenario['id'], 'commit': head,
                          'selectedFiles': selected, 'excludedProjects': scenario.get('excludedProjects', []),
                          'excludedWorkingChanges': dirty, 'historicalArtifactsPreserved': len(historical),
                          'committedInputsUnchanged': True, 'activeCheckoutUnchanged': True,
                          'status': 'complete' if len(executions) == 3 and all(value['status'] == 'complete' for value in executions.values()) else 'failed',
                          'execution': executions, 'artifactHashes': hashes(output), 'output': str(output.relative_to(output_root))}
                results.append(record)
                write_json(output_root / 'runs.json', {'seconds': time.monotonic() - started, 'runs': results})
                print(json.dumps({key: record[key] for key in ['sample', 'corpus', 'scenario', 'status']}), flush=True)
                if record['status'] != 'complete':
                    # Preserve the first failure. A harness fix needs another sealed commit and receipt.
                    return 1
    write_json(output_root / 'runs.json', {'seconds': time.monotonic() - started, 'runs': results})
    print(json.dumps({'output': str(output_root), 'seconds': time.monotonic() - started}), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
