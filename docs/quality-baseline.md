# Quality Baseline

## Current Status

After commit `471187217d84c695b6b79671d53a5fe0504b487d` the project baseline is:

- API lint: 0 errors, 0 warnings
- API typecheck: 0 errors
- API tests: 358 passed
- API build: successful
- Web tests: 124 passed
- Web lint: clean
- Web build: successful
- GitHub Actions CI: green

## CI Gates

Current CI checks:

1. **Build API**
   ```bash
   pnpm --filter api build
   ```

2. **Lint API**
   ```bash
   pnpm --filter api lint
   ```

3. **Typecheck API**
   ```bash
   pnpm --filter api typecheck
   ```

4. **Test API**
   ```bash
   pnpm --filter api test
   ```

5. **Test Web**
   ```bash
   pnpm --filter web test
   ```

6. **Lint Web**
   ```bash
   pnpm --filter web lint
   ```

7. **Build Web**
   ```bash
   pnpm --filter web build
   ```

## Why Typecheck API Exists

- `api build` uses NestJS build and `tsconfig.build.json`.
- `tsconfig.build.json` excludes `**/*spec.ts`.
- Therefore build checks runtime code but does not fully typecheck spec files.
- `pnpm --filter api typecheck` runs `tsc --noEmit` using the default API `tsconfig.json`.
- This catches broken mocks, nullable errors, incorrect Prisma relation shapes, and repository return-type mismatches in tests.

## Development Rule

Before pushing code that touches API runtime, specs, repositories, DTOs, or Prisma-related mocks, run:

```bash
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api build
```

For web changes, also run:

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

### Heavy page tests

Workspace and channel page tests (`page.test.tsx` under `workspaces/`) are
excluded from the default `pnpm --filter web test` because they cause heap OOM
when loaded alongside other tests in the same vitest run.

Run them separately with:

```bash
pnpm --filter web test:pages
```

Run this before/after touching workspace or channel page UI to ensure the
excluded tests are not forgotten. Do not add `test:pages` to CI until the OOM
issue is resolved.

## Do Not Weaken Checks

- Do not remove the Typecheck API CI step.
- Do not exclude spec files from typecheck to hide errors.
- Do not replace proper typed factories with `as any`.
- Do not add `eslint-disable` unless there is a documented reason.
- Prefer repository return-type aliases and typed mock factories.
