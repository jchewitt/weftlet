"""Summarize retained study outputs without extraction or changes to case scoring."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import statistics
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--workspace', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
workspace = pathlib.Path(args.workspace).resolve()
output = pathlib.Path(args.output).resolve()
output.mkdir(exist_ok=True, parents=True)
def read(path):
    return json.loads(path.read_text())
def write(name, value):
    (output / name).write_text(json.dumps(value, indent=2) + '\n')
def sha(data):
    return hashlib.sha256(data).hexdigest()
receipt = read(workspace / 'replay-receipt.json')
original = pathlib.Path(receipt['originalMeasurement'])
replay = workspace / ('replay-' + receipt['harnessCommit'][:12])
replays = read(replay / 'replays.json')
original_runs = {r['output']: r for r in read(original / 'runs.json')['runs']}
assert len(replays['runs']) == len(original_runs), 'Incomplete replay'
records = []
loaded = {}
for run in replays['runs']:
    initial = original_runs[run['originalOutput']]
    native_dir, corrected_dir = original / initial['output'], replay / run['output']
    spec = read(native_dir.parent / 'spec.json')
    comparison = read(corrected_dir / 'comparison.json')
    before = read(native_dir / 'comparison.json')
    scip, graphify = read(native_dir / 'scip.phases.json'), read(native_dir / 'graphify.phases.json')
    record = {key: initial[key] for key in ['sample', 'corpus', 'scenario', 'commit', 'selectedFiles',
              'excludedProjects', 'excludedWorkingChanges', 'historicalArtifactsPreserved',
              'committedInputsUnchanged', 'activeCheckoutUnchanged']}
    record['replayHistoricalArtifactsPreserved'] = run['historicalArtifactsPreserved']
    record['cost'] = {'scip': scip, 'graphify': graphify,
                     'workers': {key: {field: execution[field] for field in ['containerWallSeconds', 'metrics', 'oomKilled']}
                                 for key, execution in initial['execution'].items()},
                     'replayAssembly': {key: run['execution'][key] for key in ['containerWallSeconds', 'metrics', 'oomKilled']},
                     'originalOutputBytes': sum(p.stat().st_size for p in native_dir.iterdir() if p.is_file())}
    record['arms'] = []
    loaded[(run['sample'], run['corpus'], run['scenario'])] = (record, corrected_dir, native_dir)
    for report, prior in zip(comparison['reports'], before['reports']):
        score = report['score']
        arm = {key: report[key] for key in ['arm', 'rawCounts', 'unsupportedTracks']}
        arm.update({key: score[key] for key in ['tracks', 'gaps', 'declarationSpans', 'invalidCitations',
                                              'ambiguousIdentities', 'unjudgedReferences', 'logicalDigest']})
        # Exclude only other-corpus labels when listing scenario removals.
        cold_scores = read((original / f"{run['sample']}-{run['corpus']}-cold/output/comparison.json"))['reports']
        other_corpus = set(cold_scores[0]['score']['removedCases'])
        arm['removedScenarioCases'] = [c for c in score['removedCases'] if c not in other_corpus]
        arm['beforeCorrectionTracks'] = prior['score']['tracks']
        arm['familyCoverage'] = {'found': sum(d['found'] > 0 for d in score['declarationSpans']),
                                 'expected': len(score['declarationSpans'])}
        arm['coarseCandidates'] = {track: sum(c['coarseCandidate'] for c in score['cases']
             if c['track'] == track and c['expected'] == 'present') for track in score['tracks']}
        if run['scenario'] == 'cold' and run['sample'] == 1:
            arm['cases'] = score['cases']
        arm['modes'] = {}
        for mode, result in report['modes'].items():
            business = result['business']
            controls = {}
            if run['corpus'] == 'business':
                for name in ['collection', 'status']:
                    query = business[name]
                    controls[name] = {k: query[k] for k in ['pages', 'truncated', 'rules']}
                    controls[name]['files'] = [n.removeprefix('component:file:') for n in query['nodeIds'] if n.startswith('component:file:')]
                if 'paths' in business:
                    controls['paths'] = [{'count': len(p['paths']), 'search': p['search']} for p in business['paths']]
            else:
                controls['dispatch'] = [{key: item[key] for key in ['id', 'recall', 'exploration', 'distractions']}
                                         for item in business['dispatch']]
            arm['modes'][mode] = {key: result[key] for key in ['factCount', 'rdfProjectionParity', 'shapeConformance',
                                        'validationSeconds', 'querySeconds', 'snapshotId', 'contentDigest']}
            arm['modes'][mode]['controls'] = controls
        record['arms'].append(arm)
    record['rawCoverage'] = {'scipDocuments': [d['relative_path'] for d in read(native_dir / 'scip.raw.json')['documents']],
                            'graphifySources': [p.removeprefix(spec['isolatedRoot'] + '/') for p in read(native_dir / 'graphify.raw.json')['extracted_sources']]}
    records.append(record)

# Inspect existing results; these checks do not alter the sealed scores or artifact bytes.
def decl_ids(normalized, exclude):
    result = {}
    for entity in normalized['entities']:
        for span in entity['definitions']:
            if span['path'] in exclude:
                continue
            key = json.dumps({key: value for key, value in span.items() if key not in ['commit', 'digest']}, sort_keys=True)
            result.setdefault(key, []).append(entity['id'])
    return {key: sorted(set(ids)) for key, ids in result.items()}
for record, corrected_dir, native_dir in loaded.values():
    base_record, base_dir, base_native = loaded[(record['sample'], record['corpus'], 'cold')]
    changed = {'body-edit': ['services/api/src/analyze.ts'], 'rename': ['services/api/src/analyze.ts', 'services/api/src/inspect.ts'],
               'delete': ['tests/parse.test.ts'], 'omitted-project': ['services/worker/src/consume.ts']}.get(record['scenario'], [])
    record['stability'] = []
    for arm in record['arms']:
        name = arm['arm']; base = read(base_dir / f'{name}.normalized.json'); current = read(corrected_dir / f'{name}.normalized.json')
        spans = [s for entity in current['entities'] for s in entity['definitions']] + [r['span'] for r in current['references']]
        forbidden = {'rename': ['services/api/src/analyze.ts'], 'delete': ['tests/parse.test.ts'],
                     'omitted-project': ['services/worker/src/consume.ts']}.get(record['scenario'], [])
        record['stability'].append({'arm': name,
            'sameCommitNormalizedBytesEqual': (base_dir / f'{name}.normalized.json').read_bytes() == (corrected_dir / f'{name}.normalized.json').read_bytes() if record['commit'] == base_record['commit'] else None,
            'unaffectedDeclarationIdentitiesEqual': decl_ids(base, changed) == decl_ids(current, changed),
            'forbiddenCurrentSpans': [span for span in spans if span['path'] in forbidden]})
    record['nativeBytesEqualToCold'] = {name: (base_native / name).read_bytes() == (native_dir / name).read_bytes()
                                       for name in ['index.scip', 'scip.raw.json', 'graphify.raw.json']}

medians = []
for corpus in ['business', 'dispatch']:
    for scenario in sorted({r['scenario'] for r in records if r['corpus'] == corpus}):
        group = [r for r in records if r['corpus'] == corpus and r['scenario'] == scenario]
        values = {'scipIndexSeconds': [next(p['seconds'] for p in r['cost']['scip']['phases'] if p['phase'] == 'index') for r in group],
                  'baselineHydrationSeconds': [next(p['seconds'] for p in r['cost']['scip']['phases'] if p['phase'] == 'baseline-hydration') for r in group],
                  'graphifyStaticSeconds': [r['cost']['graphify']['staticSeconds'] for r in group]}
        for worker in ['scip', 'graphify']:
            for metric in ['seconds', 'processTreePeakRssSampledBytes', 'cgroupMemoryPeakBytes']:
                values[f'{worker}Worker.{metric}'] = [r['cost']['workers'][worker]['metrics'][metric] for r in group]
        medians.append({'corpus': corpus, 'scenario': scenario, 'samples': len(group),
                        'metrics': {k: {'median': statistics.median(v), 'min': min(v), 'max': max(v)} for k, v in values.items()}})
write('results.json', {'schemaVersion': 1, 'receipt': receipt, 'cumulativeMeasurementSeconds': replays['cumulativeMeasurementSeconds'],
                      'completedRuns': len(records), 'metrics': medians, 'runs': records})

# Export only explicit public experiment outputs. Never recurse into consumers, caches, tools or credentials.
allowed = {'receipt.json', 'failure.json', 'interruption.json', 'runs.json', 'replays.json', 'cases.json'}
entries = []
for root in [workspace / 'measurement-d58df3ecb1b1', original, replay]:
    for path in sorted(root.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        include = len(relative.parts) == 1 and path.name in allowed
        include |= len(relative.parts) == 2 and path.name == 'spec.json'
        include |= len(relative.parts) == 3 and relative.parts[1] == 'output' and path.suffix in ['.json', '.log', '.scip']
        if include:
            entries.append((root.name + '/' + relative.as_posix(), path.read_bytes()))
for name in ['measurement-1.log', 'measurement-2.log', 'replay.log', 'preflight-2.log', 'replay-preflight.log']:
    entries.append(('driver-logs/' + name, (workspace / name).read_bytes()))
# Retain the sealed destination-authored harness sources even after a squash merge removes
# those commits from main's ancestry. This contains no Git directory or upstream source.
repo = pathlib.Path(__file__).resolve().parents[2]
commits = {receipt['harnessCommit'], receipt['originalHarnessCommit'], receipt['priorAttempt']}
for commit in sorted(commits):
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', commit, '--',
                                     'scripts/code-graph-study'], cwd=repo, text=True).splitlines()
    for path in paths:
        data = subprocess.check_output(['git', 'show', f'{commit}:{path}'], cwd=repo)
        entries.append((f'harness/{commit}/{path}', data))
buffer = io.BytesIO()
with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
    with tarfile.open(fileobj=compressed, mode='w') as archive:
        for name, data in entries:
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
            archive.addfile(info, io.BytesIO(data))
bundle = buffer.getvalue()
(output / 'public-evidence.tar.gz').write_bytes(bundle)
write('export-inventory.json', {'schemaVersion': 1,
    'scope': 'Generated only from frozen public synthetic fixtures; no source application, credentials, installed dependencies or upstream source code.',
    'bundle': {'path': 'public-evidence.tar.gz', 'sha256': sha(bundle), 'bytes': len(bundle)},
    'entries': [{'path': name, 'bytes': len(data), 'sha256': sha(data)} for name, data in entries]})
print(json.dumps({'runs': len(records), 'bundleBytes': len(bundle), 'exportedFiles': len(entries)}))
