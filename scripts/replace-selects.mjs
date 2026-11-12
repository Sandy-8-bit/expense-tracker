import { readFileSync, writeFileSync } from 'node:fs';
const files = [
  'src/components/ui/finance.tsx',
  ...[
    'classify-dialog',
    'import-statement',
    'invoice-details',
    'reports',
    'workspace',
    'transactions',
  ].map((name) => `src/features/${name}.tsx`),
];
for (const file of files) {
  let source = readFileSync(file, 'utf8');
  source = source.replace(/<select\b/g, '<Select').replace(/<\/select>/g, '</Select>');
  const path = file.includes('/features/') ? '../components/ui/select' : './select';
  source = source.replace("'use client';", `'use client';\nimport { Select } from '${path}';`);
  writeFileSync(file, source);
}
