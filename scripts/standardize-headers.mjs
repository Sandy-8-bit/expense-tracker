import { readFileSync, writeFileSync } from 'node:fs';
for (const name of ['workspace', 'reports', 'transactions', 'import-statement']) {
  const file = `src/features/${name}.tsx`;
  let source = readFileSync(file, 'utf8');
  // Identify balanced JSX div elements so nested action groups stay unchanged.
  let start;
  while ((start = source.indexOf('<div className="section-heading">')) !== -1) {
    const tail = source.slice(start);
    const tags = /<div\b[^>]*>|<\/div>/g;
    let depth = 0;
    for (const match of tail.matchAll(tags)) {
      depth += match[0] === '</div>' ? -1 : 1;
      if (depth === 0) {
        const end = start + match.index;
        source =
          source.slice(0, start) +
          '<PageHeader>' +
          source.slice(start + '<div className="section-heading">'.length, end) +
          '</PageHeader>' +
          source.slice(end + 6);
        break;
      }
    }
  }
  source = source.replace(
    "'use client';",
    "'use client';\nimport { PageHeader } from '../components/ui/page-header';",
  );
  writeFileSync(file, source);
}
