#!/usr/bin/env node
// Builds the single-app bundle for GoDaddy Node.js Hosting from this repo:
//   node deploy/godaddy/build.mjs           -> dist/godaddy/ (the app folder) + dist/norukutheeni-godaddy.zip
//   node deploy/godaddy/build.mjs --push    -> also commit it to the `godaddy` branch and push (for Git sync)
//
// The platform runs one app per upload: production install (no devDependencies)
// -> `npm run build` -> `npm start`. The bundle therefore contains the Next.js
// website at its root, the Express API under server/, one server.js serving
// both, a merged package.json whose build tools are regular dependencies,
// a lockfile and an .npmrc pointing at the public registry.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dist = path.join(repo, 'dist');
const out = path.join(dist, 'godaddy');
const zipPath = path.join(dist, 'norukutheeni-godaddy.zip');
const BRANCH = 'godaddy';
const push = process.argv.includes('--push');

const run = (cmd, args, opts = {}) =>
  (execFileSync(cmd, args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }) ?? '').trim();
const npm = (args, cwd) =>
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

// Website build tools that the platform's production install must include.
const BUILD_TOOLS = ['@tailwindcss/postcss', 'tailwindcss', 'typescript', '@types/node', '@types/react', '@types/react-dom'];
const WEBSITE_FILES = ['src', 'public', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts'];

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k]).map((k) => [k, obj[k]]));

async function buildBundle() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const name of WEBSITE_FILES) {
    await cp(path.join(repo, 'frontend', name), path.join(out, name), { recursive: true });
  }
  // server.js runs Next in-process, so the Docker-only standalone output is not needed
  // (and makes Next log a misleading "next start does not work" warning).
  const nextConfig = path.join(out, 'next.config.ts');
  const withoutStandalone = (await readFile(nextConfig, 'utf8')).replace(/^\s*output: "standalone",\r?\n/m, '');
  if (withoutStandalone.includes('standalone')) throw new Error('next.config.ts: could not remove output: "standalone"');
  await writeFile(nextConfig, withoutStandalone);
  await cp(path.join(repo, 'backend', 'src'), path.join(out, 'server'), { recursive: true });
  await cp(path.join(here, 'server.js'), path.join(out, 'server.js'));
  await cp(path.join(here, 'README.md'), path.join(out, 'README.md'));
  await cp(path.join(here, 'env.example'), path.join(out, '.env.example'));
  await writeFile(path.join(out, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
  await writeFile(path.join(out, '.gitignore'), 'node_modules/\n.next/\n.env\n.env.*\n!.env.example\npublic/assets/uploads/\n');

  const api = await readJson(path.join(repo, 'backend', 'package.json'));
  const web = await readJson(path.join(repo, 'frontend', 'package.json'));
  const commit = run('git', ['rev-parse', '--short', 'HEAD']);
  const pkg = {
    name: 'noruku-theeni-store',
    version: api.version,
    private: true,
    description: `Sweets & snacks store (website + API) for GoDaddy Node.js Hosting. Built from ${commit}.`,
    type: 'module',
    main: 'server.js',
    engines: { node: '>=22.12' },
    // webpack, not Turbopack: Turbopack runs PostCSS in a helper process that binds a local
    // port, which GoDaddy's build sandbox refuses ("binding to a port: Permission denied").
    scripts: { build: 'next build --webpack', start: 'node server.js' },
    dependencies: sortKeys({ ...api.dependencies, ...web.dependencies, ...pick(web.devDependencies, BUILD_TOOLS) }),
  };
  await writeFile(path.join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  console.log('Resolving dependencies (package-lock.json)…');
  npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], out);
  const lock = await readFile(path.join(out, 'package-lock.json'), 'utf8');
  const foreign = [...lock.matchAll(/"resolved":\s*"(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('https://registry.npmjs.org/'));
  if (foreign.length) throw new Error(`Lockfile has non-public registry URLs (e.g. ${foreign[0]}); GoDaddy requires registry.npmjs.org`);
  return commit;
}

/** Commits dist/godaddy to the `godaddy` branch (in a temporary worktree) and zips that commit. */
async function commitBundle(commit) {
  const worktree = await mkdtemp(path.join(os.tmpdir(), 'godaddy-bundle-'));
  try {
    run('git', ['fetch', '-q', 'origin']);
    const local = run('git', ['branch', '--list', BRANCH]);
    const remote = run('git', ['branch', '-r', '--list', `origin/${BRANCH}`]);
    if (local) run('git', ['worktree', 'add', '-q', worktree, BRANCH]);
    else if (remote) run('git', ['worktree', 'add', '-q', '-b', BRANCH, worktree, `origin/${BRANCH}`]);
    else {
      run('git', ['worktree', 'add', '-q', '--detach', worktree]);
      run('git', ['checkout', '-q', '--orphan', BRANCH], { cwd: worktree });
    }
    const git = (args) => run('git', args, { cwd: worktree });

    for (const name of await readdir(worktree)) {
      if (name !== '.git') await rm(path.join(worktree, name), { recursive: true, force: true });
    }
    await cp(out, worktree, { recursive: true });
    git(['add', '-A']);
    if (git(['status', '--porcelain'])) {
      git(['commit', '-q', '-m', `Deploy bundle built from ${commit}`, '-m', 'Generated by deploy/godaddy/build.mjs; do not edit this branch by hand.']);
      console.log(`Committed the bundle to branch ${BRANCH}.`);
    } else {
      console.log(`Branch ${BRANCH} already matches this build.`);
    }
    if (push) {
      git(['push', '-q', '-u', 'origin', BRANCH]);
      console.log(`Pushed ${BRANCH} to origin.`);
    }
  } finally {
    // Don't let clean-up failures hide the original error.
    try {
      run('git', ['worktree', 'remove', '--force', worktree], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      await rm(worktree, { recursive: true, force: true });
      run('git', ['worktree', 'prune']);
    }
  }
  await rm(zipPath, { force: true });
  run('git', ['archive', '--format=zip', '-o', zipPath, BRANCH]);
}

const commit = await buildBundle();
await commitBundle(commit);
console.log(`\nBundle folder: ${out}\nZip for upload: ${zipPath}`);
