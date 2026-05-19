---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-implementer
batch: B3
priority: normal
search_hooks: [Angular CDK, dependency version, Angular 20]
---

**Question considered:** Which `@angular/cdk` version should B3 use with Angular 20?

**Decision:** Use `@angular/cdk@^20.2.14`.

**Reasoning:** The brief requested Angular 20 and `@angular/cdk`. The initially attempted `^20.3.0` range does not exist in the npm registry, and `^21.2.5` requires Angular 21 peer dependencies. `20.2.14` is the published Angular-20-compatible CDK line.

**Default alternative rejected:** Force-install Angular CDK 21 with peer dependency conflicts. That would make the workspace harder to reproduce.

**Promotion target:** Keep in `frontend/package.json`; no broader rule needed.
