import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'source-evidence': 'src/producer/evidence/index.ts',
    'source-ci': 'src/producer/ci/index.ts',
    'source-project': 'src/producer/project/index.ts',
    'guard-facts': 'src/guard/facts/index.ts',
    'guard-rules': 'src/guard/rules/index.ts',
    'guard-writes': 'src/guard/writes/index.ts',
    'guard-docs': 'src/guard/docs/index.ts',
  },
  outDir: 'lib',
  format: 'esm',
  fixedExtension: false,
  platform: 'node',
  target: 'es2023',
  dts: true,
  clean: true,
  deps: { neverBundle: [/^@deepseek-ai\//, 'zod', 'yaml'] },
})
