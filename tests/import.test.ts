import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { useFunctionMock } from '@chubbyts/chubbyts-function-mock/dist/function-mock';
import plugin from '../src/import';

type Report = (descriptor: { node: unknown; message: string }) => void;

const testDirectory = dirname(fileURLToPath(import.meta.url));
const testFilename = join(testDirectory, 'import.test.ts');
const resolverFixtureFilename = join(testDirectory, 'fixtures', 'resolver', 'entry.ts');
const tsconfigProjectFilename = join(testDirectory, 'fixtures', 'tsconfig-project', 'src', 'entry.ts');

const withSource = (type: string, value: string): { type: string; source: { type: string; value: string } } => ({
  type,
  source: { type: 'Literal', value },
});

describe('import', () => {
  test('plugin', () => {
    expect(plugin.meta).toEqual({ name: '@chubbyts/chubbyts-oxlint-import' });
    expect(Object.keys(plugin.rules)).toEqual(['order', 'no-unresolved']);
  });

  describe('no-unresolved', () => {
    const rule = { ...plugin.rules }['no-unresolved'];

    test('meta', () => {
      expect(rule.meta).toEqual({
        type: 'problem',
        docs: {
          description:
            'Ensure imports point to a file/module that can be resolved. Reimplementation of import-x/no-unresolved on top of oxc-resolver.',
        },
      });
    });

    test('ignores resolvable sources', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: testFilename, report });

      handlers.ImportDeclaration(withSource('ImportDeclaration', 'node:fs'));
      handlers.ImportDeclaration(withSource('ImportDeclaration', 'vitest'));
      handlers.ImportDeclaration(withSource('ImportDeclaration', '../src/functional.js'));
      handlers.ImportExpression(withSource('ImportExpression', '../src/import.js'));
      handlers.ExportAllDeclaration(withSource('ExportAllDeclaration', 'node:path'));

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores sources resolvable via each configured extension', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: resolverFixtureFilename, report });

      ['./ext-ts', './ext-tsx', './ext-dts', './ext-js', './ext-jsx', './ext-json', './ext-node'].forEach((source) => {
        handlers.ImportDeclaration(withSource('ImportDeclaration', source));
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores sources resolvable via each configured extension alias', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: resolverFixtureFilename, report });

      [
        './aliasjs-ts.js',
        './aliasjs-tsx.js',
        './aliasjs-dts.js',
        './aliasjs-js.js',
        './aliasjsx-tsx.jsx',
        './aliasjsx-dts.jsx',
        './aliasjsx-jsx.jsx',
        './aliasmjs-mts.mjs',
        './aliasmjs-dmts.mjs',
        './aliasmjs-mjs.mjs',
        './aliascjs-cts.cjs',
        './aliascjs-dcts.cjs',
        './aliascjs-cjs.cjs',
      ].forEach((source) => {
        handlers.ImportDeclaration(withSource('ImportDeclaration', source));
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores sources resolvable via each configured condition name', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: resolverFixtureFilename, report });

      ['#cond-types', '#cond-import', '#cond-require', '#cond-node', '#cond-default'].forEach((source) => {
        handlers.ImportDeclaration(withSource('ImportDeclaration', source));
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores sources resolvable via each configured main field', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: resolverFixtureFilename, report });

      ['./pkg/main-types', './pkg/main-module', './pkg/main-main'].forEach((source) => {
        handlers.ImportDeclaration(withSource('ImportDeclaration', source));
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores sources resolvable via the paths of the nearest tsconfig', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: tsconfigProjectFilename, report });

      handlers.ImportDeclaration(withSource('ImportDeclaration', '@fixture/target'));

      expect(reportMocks).toHaveLength(0);
    });

    test('caches tsconfig lookups and resolvers', () => {
      const base = mkdtempSync(join(tmpdir(), 'chubbyts-oxlint-'));
      mkdirSync(join(base, 'src'));
      writeFileSync(
        join(base, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@cached/target': ['./src/target.ts'] } } }),
      );
      writeFileSync(join(base, 'src', 'target.ts'), '// fixture\n');

      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: join(base, 'src', 'entry.ts'), report });

      handlers.ImportDeclaration(withSource('ImportDeclaration', '@cached/target'));
      rmSync(join(base, 'tsconfig.json'));
      handlers.ImportDeclaration(withSource('ImportDeclaration', '@cached/target'));

      rmSync(base, { recursive: true, force: true });

      expect(reportMocks).toHaveLength(0);
    });

    test('reports unresolvable sources', () => {
      const importNode = withSource('ImportDeclaration', './does-not-exist.js');
      const exportNode = withSource('ExportNamedDeclaration', './also-missing.js');

      const [report, reportMocks] = useFunctionMock<Report>([
        {
          parameters: [{ node: importNode.source, message: "Unable to resolve path to module './does-not-exist.js'." }],
        },
        { parameters: [{ node: exportNode.source, message: "Unable to resolve path to module './also-missing.js'." }] },
      ]);

      const handlers = rule.create({ filename: testFilename, report });

      handlers.ImportDeclaration(importNode);
      handlers.ExportNamedDeclaration(exportNode);

      expect(reportMocks).toHaveLength(0);
    });

    test('reports unresolvable source without a surrounding tsconfig', () => {
      const node = withSource('ImportDeclaration', 'missing-package');

      const [report, reportMocks] = useFunctionMock<Report>([
        { parameters: [{ node: node.source, message: "Unable to resolve path to module 'missing-package'." }] },
      ]);

      const handlers = rule.create({ filename: '/does-not-exist/file.ts', report });

      handlers.ImportDeclaration(node);

      expect(reportMocks).toHaveLength(0);
    });

    test('supports getFilename as filename fallback', () => {
      const node = withSource('ImportDeclaration', './does-not-exist.js');

      const [getFilename, getFilenameMocks] = useFunctionMock<() => string>([{ parameters: [], return: testFilename }]);

      const [report, reportMocks] = useFunctionMock<Report>([
        { parameters: [{ node: node.source, message: "Unable to resolve path to module './does-not-exist.js'." }] },
      ]);

      rule.create({ getFilename, report }).ImportDeclaration(node);

      expect(getFilenameMocks).toHaveLength(0);
      expect(reportMocks).toHaveLength(0);
    });

    test('supports missing filename', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ report });

      handlers.ImportDeclaration(withSource('ImportDeclaration', 'node:fs'));
      handlers.ImportDeclaration(withSource('ImportDeclaration', 'vitest'));

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores nodes without a usable source', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      const handlers = rule.create({ filename: testFilename, report });

      handlers.ExportNamedDeclaration({ type: 'ExportNamedDeclaration' });
      handlers.ExportNamedDeclaration({ type: 'ExportNamedDeclaration', source: null });
      handlers.ImportDeclaration({ type: 'ImportDeclaration', source: { type: 'TemplateLiteral' } });
      handlers.ImportDeclaration({ type: 'ImportDeclaration', source: { type: 'Literal', value: 1 } });

      expect(reportMocks).toHaveLength(0);
    });
  });

  describe('order', () => {
    const rule = { ...plugin.rules }.order;

    test('meta', () => {
      expect(rule.meta).toEqual({
        type: 'suggestion',
        docs: {
          description:
            'Enforce import order (builtin, external, parent, sibling, index). Reimplementation of import-x/order with its default options.',
        },
      });
    });

    test('ignores program without body', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      rule.create({ report }).Program({ type: 'Program' });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores correctly ordered imports', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      rule.create({ report }).Program({
        type: 'Program',
        body: [
          withSource('ImportDeclaration', 'node:fs'),
          withSource('ImportDeclaration', '@chubbyts/chubbyts-function-mock'),
          withSource('ImportDeclaration', 'vitest'),
          withSource('ImportDeclaration', '..'),
          withSource('ImportDeclaration', '../other'),
          withSource('ImportDeclaration', './sibling'),
          withSource('ImportDeclaration', './index.js'),
          withSource('ImportDeclaration', '.'),
        ],
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores index like imports in any order', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      rule.create({ report }).Program({
        type: 'Program',
        body: [
          withSource('ImportDeclaration', '.'),
          withSource('ImportDeclaration', './'),
          withSource('ImportDeclaration', './index'),
          withSource('ImportDeclaration', './index.js'),
          withSource('ImportDeclaration', './index.ts'),
        ],
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('ignores non import statements and imports without literal source', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      rule.create({ report }).Program({
        type: 'Program',
        body: [
          { type: 'ExpressionStatement' },
          withSource('ExpressionStatement', 'vitest'),
          { type: 'ImportDeclaration', source: { type: 'TemplateLiteral' } },
          withSource('ImportDeclaration', 'node:fs'),
        ],
      });

      expect(reportMocks).toHaveLength(0);
    });

    test('reports imports occurring after imports of a later group', () => {
      const siblingImport = withSource('ImportDeclaration', './sibling');
      const builtinImport = withSource('ImportDeclaration', 'node:fs');
      const externalImport = withSource('ImportDeclaration', 'vitest');

      const [report, reportMocks] = useFunctionMock<Report>([
        {
          parameters: [{ node: builtinImport, message: '`node:fs` import should occur before import of `./sibling`' }],
        },
        {
          parameters: [{ node: externalImport, message: '`vitest` import should occur before import of `./sibling`' }],
        },
      ]);

      rule.create({ report }).Program({ type: 'Program', body: [siblingImport, builtinImport, externalImport] });

      expect(reportMocks).toHaveLength(0);
    });

    test('reports builtin import occurring after external import', () => {
      const externalImport = withSource('ImportDeclaration', 'vitest');
      const builtinImport = withSource('ImportDeclaration', 'node:fs');

      const [report, reportMocks] = useFunctionMock<Report>([
        { parameters: [{ node: builtinImport, message: '`node:fs` import should occur before import of `vitest`' }] },
      ]);

      rule.create({ report }).Program({ type: 'Program', body: [externalImport, builtinImport] });

      expect(reportMocks).toHaveLength(0);
    });

    test('reports external import occurring after parent import', () => {
      const parentImport = withSource('ImportDeclaration', '../parent');
      const externalImport = withSource('ImportDeclaration', 'vitest');

      const [report, reportMocks] = useFunctionMock<Report>([
        {
          parameters: [{ node: externalImport, message: '`vitest` import should occur before import of `../parent`' }],
        },
      ]);

      rule.create({ report }).Program({ type: 'Program', body: [parentImport, externalImport] });

      expect(reportMocks).toHaveLength(0);
    });
  });
});
