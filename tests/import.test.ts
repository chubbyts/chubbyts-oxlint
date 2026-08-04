import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { useFunctionMock } from '@chubbyts/chubbyts-function-mock/dist/function-mock';
import plugin from '../src/import';

type Report = (descriptor: { node: unknown; message: string }) => void;

const testFilename = join(dirname(fileURLToPath(import.meta.url)), 'import.test.ts');

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
    const rule = plugin.rules['no-unresolved'];

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

      rule.create({ report }).ImportDeclaration(withSource('ImportDeclaration', 'node:fs'));

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
    const rule = plugin.rules.order;

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

    test('ignores non import statements and imports without literal source', () => {
      const [report, reportMocks] = useFunctionMock<Report>([]);

      rule.create({ report }).Program({
        type: 'Program',
        body: [
          { type: 'ExpressionStatement' },
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
  });
});
