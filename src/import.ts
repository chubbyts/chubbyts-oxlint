import { isBuiltin } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { ResolverFactory } from 'oxc-resolver';

type EsNode = {
  type: string;
  value?: unknown;
  source?: EsNode | null;
  body?: Array<EsNode>;
};

type RuleContext = {
  filename?: string;
  getFilename?: () => string;
  report: (descriptor: { node: EsNode; message: string }) => void;
};

type Rule = {
  meta: { type: string; docs: { description: string } };
  create: (context: RuleContext) => Record<string, (node: EsNode) => void>;
};

const RESOLVER_OPTIONS = {
  extensions: ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.json', '.node'],
  extensionAlias: {
    '.js': ['.ts', '.tsx', '.d.ts', '.js'],
    '.jsx': ['.tsx', '.d.ts', '.jsx'],
    '.mjs': ['.mts', '.d.mts', '.mjs'],
    '.cjs': ['.cts', '.d.cts', '.cjs'],
  },
  conditionNames: ['types', 'import', 'require', 'node'],
  mainFields: ['types', 'module', 'main'],
};

const tsconfigByDirectory = new Map<string, string | undefined>();

const lookupTsconfig = (directory: string): string | undefined => {
  const candidate = join(directory, 'tsconfig.json');

  if (existsSync(candidate)) {
    return candidate;
  }

  const parent = dirname(directory);

  return parent !== directory ? findTsconfig(parent) : undefined;
};

const findTsconfig = (directory: string): string | undefined => {
  if (tsconfigByDirectory.has(directory)) {
    return tsconfigByDirectory.get(directory);
  }

  const found = lookupTsconfig(directory);

  tsconfigByDirectory.set(directory, found);

  return found;
};

const resolverByTsconfig = new Map<string | undefined, ResolverFactory>();

const resolverFor = (tsconfig: string | undefined): ResolverFactory => {
  const existing = resolverByTsconfig.get(tsconfig);

  if (existing) {
    return existing;
  }

  const created = new ResolverFactory({
    ...RESOLVER_OPTIONS,
    ...(tsconfig ? { tsconfig: { configFile: tsconfig, references: 'auto' as const } } : {}),
  });

  resolverByTsconfig.set(tsconfig, created);

  return created;
};

const resolves = (source: string, directory: string): boolean => {
  if (isBuiltin(source)) {
    return true;
  }

  return !!resolverFor(findTsconfig(directory)).sync(directory, source).path;
};

const contextDirectory = (context: RuleContext): string => {
  const filename = context.filename ?? context.getFilename?.();

  return filename ? dirname(filename) : cwd();
};

const sourceValue = (node: EsNode): string | undefined => {
  const source = node.source;

  if (source?.type === 'Literal' && typeof source.value === 'string') {
    return source.value;
  }

  return undefined;
};

const noUnresolved: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure imports point to a file/module that can be resolved. Reimplementation of import-x/no-unresolved on top of oxc-resolver.',
    },
  },
  create: (context) => {
    const checkSource = (node: EsNode): void => {
      const value = sourceValue(node);

      if (value === undefined) {
        return;
      }

      if (!resolves(value, contextDirectory(context))) {
        context.report({ node: node.source as EsNode, message: `Unable to resolve path to module '${value}'.` });
      }
    };

    return {
      ImportDeclaration: checkSource,
      ImportExpression: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
    };
  },
};

const INDEX_SOURCES = new Set(['.', './', './index', './index.js', './index.ts']);

const GROUP_NAMES = ['builtin', 'external', 'parent', 'sibling', 'index'];

const rankOf = (source: string): number => {
  if (isBuiltin(source)) {
    return 0;
  }

  if (INDEX_SOURCES.has(source)) {
    return 4;
  }

  if (source.startsWith('..')) {
    return 2;
  }

  if (source.startsWith('./')) {
    return 3;
  }

  return 1;
};

const order: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: `Enforce import order (${GROUP_NAMES.join(', ')}). Reimplementation of import-x/order with its default options.`,
    },
  },
  create: (context) => ({
    Program: (program) => {
      const body = program.body;

      if (!body) {
        return;
      }

      const imports = body.filter((node) => node.type === 'ImportDeclaration' && sourceValue(node) !== undefined);

      imports.forEach((node, index) => {
        const value = sourceValue(node) as string;
        const rank = rankOf(value);

        const shouldOccurAfter = imports
          .slice(0, index)
          .find((previous) => rankOf(sourceValue(previous) as string) > rank);

        if (shouldOccurAfter) {
          context.report({
            node,
            message: `\`${value}\` import should occur before import of \`${sourceValue(shouldOccurAfter) as string}\``,
          });
        }
      });
    },
  }),
};

const plugin = {
  meta: {
    name: '@chubbyts/chubbyts-oxlint-import',
  },
  rules: {
    order,
    'no-unresolved': noUnresolved,
  },
};

export default plugin;
