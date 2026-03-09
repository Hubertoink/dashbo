import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const srcRoot = path.join(projectRoot, 'src');

function collectJavaScriptFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!statSync(srcRoot).isDirectory()) {
  console.error(`Source directory not found: ${srcRoot}`);
  process.exit(1);
}

const files = collectJavaScriptFiles(srcRoot);
const failures = [];

for (const filePath of files) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failures.push({ filePath, stderr: result.stderr.trim() });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Syntax check failed: ${failure.filePath}`);
    if (failure.stderr) console.error(failure.stderr);
  }
  process.exit(1);
}

console.log(`Checked ${files.length} backend source files.`);