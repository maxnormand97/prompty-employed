// lint-staged config — runs ESLint on staged web files and a typecheck on
// staged shared files before every commit to catch issues before CI does.
// Functions are used so the full package lint/typecheck always runs with the
// correct working directory, rather than passing individual file paths which
// can miss cross-file type errors.
module.exports = {
  'packages/web/**/*.{ts,tsx,js,mjs,cjs}': () =>
    'pnpm --filter @prompty-employed/web lint',
  'packages/shared/**/*.ts': () =>
    'pnpm --filter @prompty-employed/shared typecheck',
};
