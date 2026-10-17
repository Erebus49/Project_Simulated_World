# Reproduce the architecture review

The probes run entirely offline, using upstream code from the pinned commits. They create tiny test scenarios, not additions to the product engine. Expected assertions deliberately confirm architectural limitations as well as working isolation paths.

## WorldSeed

Checkout `AIScientists-Dev/WorldSeed` at `4ffeabfdee6dbeb1cb248bf676ad13667b22d359`. In that repository:

```powershell
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -e . 'pytest>=8.3,<9' pytest-asyncio pytest-xdist

.\.venv\Scripts\python.exe -X utf8 -m pytest tests/unit/test_action_queue.py tests/unit/test_state_store.py tests/unit/test_rules_engine.py tests/unit/test_effects.py tests/unit/test_perceiver.py tests/unit/test_inbox.py tests/unit/test_wakeup.py tests/unit/test_persistence.py tests/unit/test_persistence_adversarial.py tests/unit/test_event_log.py tests/unit/test_dm_provider_llm.py tests/integration/test_tick.py tests/integration/test_dm_budget.py tests/integration/test_tick_cycle.py tests/integration/test_run_isolation.py -o addopts= --tb=no -q

.\.venv\Scripts\python.exe -X utf8 -m pytest tests/unit/test_validate_params.py tests/unit/test_enum_filter.py tests/unit/test_constraints_separation.py tests/integration/test_perception_paths.py tests/integration/test_inbox_wake.py tests/integration/test_constraint_enforcement.py -o addopts= --tb=short -q

.\.venv\Scripts\python.exe -X utf8 -m worldseed validate configs/teahouse.yaml
.\.venv\Scripts\python.exe -X utf8 E:/cslearn/world/docs/reviews/evidence/worldseed_probe.py
```

`-o addopts=` disables the repository's automatic `-n auto`; selected tests run in one process. It does not suppress test failures or skip markers. The original fixture files referenced by failing tests are absent at the pinned commit; do not synthesize replacements if reproducing the reported results. `-X utf8` avoids a Windows-default-encoding collection error without modifying upstream source.

Only base runtime dependencies were installed. No external agent connector was started, and no optional LiteLLM/Instructor requests were made. Tests bearing `dm_provider_llm` include prompt/model checks, not evidence of a real service request.

## AgentWorld

Checkout `nicepkg/agent-world` at `81b6a7ffd1dc278e0cf2cc22e383401e56d79721`. In that repository:

```powershell
npm exec --yes --package=pnpm@9.15.0 -- pnpm install --ignore-scripts --frozen-lockfile
```

In `packages/core`, execute `.\node_modules\.bin\tsup.cmd`. Repeat in `packages/world` and `packages/memory` for the probes and hello-world example. Then from the repository root:

```powershell
.\node_modules\.bin\vitest.cmd run --reporter=dot
node E:/cslearn/world/docs/reviews/evidence/agent-world-probe.mjs
```

From `examples/hello-world`:

```powershell
.\node_modules\.bin\tsx.cmd src/main.ts
```

The root suite is the upstream suite, unmodified. Core must be built because workspace package exports point at `dist`. This build requirement is consistent with the README. Installation scripts were disabled deliberately; only the needed package builds were run. All LLM calls in probes are replaced by local async fake brains.

## Inspection checkouts

At review time the clones were placed outside the product workspace:

```text
C:/Users/ling1/AppData/Local/Temp/world-review-WorldSeed-20261016
C:/Users/ling1/AppData/Local/Temp/world-review-agent-world-20261016
```

Both upstream Git working trees remained clean after installation, builds and tests. Use the pinned GitHub references in the report if these temporary directories are cleaned later.
