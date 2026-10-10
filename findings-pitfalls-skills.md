# Findings, pitfalls, and skills

- Tool `cwd` must be inside the workspace. Running commands with `cwd` set to `/tmp/...` fails with a generic shell error. Run from `/home/user` and `cd` into `/tmp` inside the command.
- Playwright's browser CDN (`cdn.playwright.dev`) is blocked in the sandbox. Headless Chromium works from npm instead: `@sparticuz/chromium` plus `puppeteer-core`. Its bundled `al2023.tar.br` (brotli-decompressed with `zlib`, then untarred) provides `libnspr4`. Run the browser with `LD_LIBRARY_PATH` pointing at that `lib` directory.
- Node's built-in `node --test <dir>` fails on Node 22. List the test files explicitly.
- Under gravity, a placement cell is equivalent to any empty cell in the same line when the board is already settled. Bots only need one representative cell per line for the keep-gravity option, though the current heuristic evaluates every cell.
