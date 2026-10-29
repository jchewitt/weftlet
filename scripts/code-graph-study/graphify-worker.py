"""Call only the pinned, local static API. No CLI/provider/skill orchestration."""
import json
import os
import pathlib
import sys
import time

spec = json.loads(pathlib.Path(sys.argv[1]).read_text())
sys.path.insert(0, spec['graphifySource'])
from graphify.extract import extract

root = pathlib.Path(spec['isolatedRoot'])
started = time.perf_counter()
raw = extract([root / path for path in spec['selectedFiles']], root=root,
              cache_root=pathlib.Path(spec['graphifyCache']), parallel=False)
output = pathlib.Path(spec['output'])
output.mkdir(parents=True, exist_ok=True)
(output / 'graphify.raw.json').write_text(json.dumps(raw, sort_keys=True) + '\n')
(output / 'graphify.phases.json').write_text(json.dumps({
    'staticSeconds': time.perf_counter() - started, 'parallel': False,
    'inputTokens': raw.get('input_tokens'), 'outputTokens': raw.get('output_tokens'),
}) + '\n')
