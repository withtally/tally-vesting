import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACTS = [
  'MerkleVestingFactory',
  'MerkleVestingDeployer',
  'VestingWalletCliffConcrete',
  'VestingWalletFeeWrapper'
];

const OUT_DIR = path.join(__dirname, '..', 'out');
const ABI_DIR = path.join(__dirname, '..', 'abi');

async function exportAbis() {
  // Ensure abi directory exists
  await fs.mkdir(ABI_DIR, { recursive: true });

  const exported = [];

  for (const contract of CONTRACTS) {
    const artifactPath = path.join(OUT_DIR, `${contract}.sol`, `${contract}.json`);

    try {
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf-8'));
      const abiPath = path.join(ABI_DIR, `${contract}.json`);

      await fs.writeFile(abiPath, JSON.stringify(artifact.abi, null, 2));
      console.log(`✓ Exported: ${contract}.json`);
      exported.push(contract);
    } catch (err) {
      console.warn(`⚠ Warning: Could not export ${contract} - ${err.message}`);
    }
  }

  // Create index file with all ABIs
  const index = {};
  for (const contract of exported) {
    const abiPath = path.join(ABI_DIR, `${contract}.json`);
    index[contract] = JSON.parse(await fs.readFile(abiPath, 'utf-8'));
  }

  await fs.writeFile(
    path.join(ABI_DIR, 'index.json'),
    JSON.stringify(index, null, 2)
  );
  console.log(`✓ Created: index.json (${exported.length} contracts)`);
}

exportAbis().catch(err => {
  console.error('Failed to export ABIs:', err);
  process.exit(1);
});
