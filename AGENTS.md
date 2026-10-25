## Debugging discipline
- Build or type-check at most once per code change. Never re-run a build, lint or test
  if no file has changed since the last run.
- Save command output to a file and read that, instead of re-running the command:
  npx tsc -b 2>&1 | head -60 > /tmp/tsc.txt
- Prefer the narrowest check: tsc for types, eslint on the changed file, one test file.
  Run the full vite build only once, at the end.
- Do not read the same file twice in a row. After reading, state the hypothesis and make
  an edit, or read a different file.
- Keep a short "tried" list. If the same error survives two different fixes, stop, write
  down what you tried and what you think is wrong, and ask me.
- Fix the first error in the output only. Later errors are often side effects of it.