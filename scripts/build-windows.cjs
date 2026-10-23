const { spawnSync } = require('node:child_process');
const { copyFile, mkdtemp, mkdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { version, build } = require('../package.json');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'shopbot-svg-studio-'));
  const artifactName = `${build.productName}-${version}-portable.exe`;
  const builderCli = require.resolve('electron-builder/out/cli/cli.js');

  try {
    const result = spawnSync(process.execPath, [
      builderCli,
      '--win',
      'portable',
      '--x64',
      `--config.directories.output=${outputDirectory}`,
    ], { cwd: projectRoot, stdio: 'inherit' });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }

    const releaseDirectory = path.join(projectRoot, 'release');
    await mkdir(releaseDirectory, { recursive: true });
    const artifactPath = path.join(releaseDirectory, artifactName);
    await copyFile(path.join(outputDirectory, artifactName), artifactPath);
    console.log(`Windows executable created: ${artifactPath}`);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Windows packaging failed:', error);
  process.exitCode = 1;
});
