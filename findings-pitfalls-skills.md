# Findings, pitfalls, and skills

- Tool `cwd` must be inside the workspace. Running commands with `cwd` set to `/tmp/...` fails with a generic shell error. Run from `/home/user` and `cd` into `/tmp` inside the command.
- Playwright's browser CDN (`cdn.playwright.dev`) is blocked in the sandbox. Headless Chromium works from npm instead: `@sparticuz/chromium` plus `puppeteer-core`. Its bundled `al2023.tar.br` (brotli-decompressed with `zlib`, then untarred) provides `libnspr4`. Run the browser with `LD_LIBRARY_PATH` pointing at that `lib` directory.
- Node's built-in `node --test <dir>` fails on Node 22. List the test files explicitly.
- Under gravity, a placement cell is equivalent to any empty cell in the same line when the board is already settled. Bots only need one representative cell per line for the keep-gravity option, though the current heuristic evaluates every cell.
- Headless browser smoke tests: `puppeteer-core` loads from `/home/user/pr/LEv03/node_modules`, and the cached binary is `~/.cache/puppeteer/chrome-headless-shell/linux-131.0.6778.204/chrome-headless-shell-linux64/chrome-headless-shell` (a directory one level above the executable; it may need `chmod +x`). Launch with `--no-sandbox --allow-file-access-from-files`.
- Deterministic bot self-play is opening-sensitive: with no random opening, default-rule games score 0 points and fill the board in one turn per cell; a single random opening move turns the same setup into ~600-turn scoring games. Experiments that compare rules must keep the opening procedure fixed.
- With `rotateGravityEachTurn` on, removals keep pace with placements, so symmetric bot games with 2-3 players cycle forever instead of filling the board; 4-6 players still terminate. This is rule balance, not a model defect.
