# Skill: Root Cause

Goal: stop patch loops.

Workflow:
1. Reproduce the reported symptom.
2. Trace imports, state, route, API contract and runtime path.
3. Find the first incorrect assumption, not the last visible error.
4. Make the smallest coherent fix at the owning layer.
5. Search the repository for duplicate/legacy implementations.
6. Run typecheck and build; add a regression guard when practical.
7. Re-read the changed path after the fix.

Never apply a blind second patch to the same symptom. If the real cause is outside the repository, do not fake a frontend workaround; report the external dependency and required verification.
