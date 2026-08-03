import { describe, expect, test } from 'vitest';
import { useFunctionMock } from '@chubbyts/chubbyts-function-mock/dist/function-mock';
import type { EsNode, RuleContext } from '../src/functional';
import plugin from '../src/functional';

const identifier = (name: string): EsNode => ({ type: 'Identifier', name });

const callTo = (name: string, args: Array<EsNode>): EsNode => ({
  type: 'CallExpression',
  callee: identifier(name),
  arguments: args,
});

const arrow = (params: Array<EsNode>, body: EsNode): EsNode => ({
  type: 'ArrowFunctionExpression',
  params,
  body,
});

const objectCall = (object: EsNode, property: EsNode, args: Array<EsNode>, computed?: boolean): EsNode => ({
  type: 'CallExpression',
  callee: { type: 'MemberExpression', computed, object, property },
  arguments: args,
});

describe('functional', () => {
  test('plugin', () => {
    expect(plugin.meta).toEqual({ name: '@chubbyts/chubbyts-oxlint-functional' });
    expect(Object.keys(plugin.rules)).toEqual(['no-let', 'immutable-data', 'prefer-tacit']);
  });

  describe('no-let', () => {
    const rule = plugin.rules['no-let'];

    test('meta', () => {
      expect(rule.meta).toEqual({
        type: 'suggestion',
        docs: {
          description: 'Disallow mutable variables. Syntactic port of functional/no-let from eslint-plugin-functional.',
        },
      });
    });

    test('reports let', () => {
      const node: EsNode = { type: 'VariableDeclaration', kind: 'let' };

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([
        { parameters: [{ node, message: 'Unexpected let, use const instead.' }] },
      ]);

      rule.create({ report }).VariableDeclaration(node);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores const', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      rule.create({ report }).VariableDeclaration({ type: 'VariableDeclaration', kind: 'const' });

      expect(reportMocks.length).toBe(0);
    });
  });

  describe('immutable-data', () => {
    const rule = plugin.rules['immutable-data'];
    const message = 'Modifying an existing object/array is not allowed.';

    test('meta', () => {
      expect(rule.meta.type).toBe('suggestion');
    });

    test('reports assignment to member expression', () => {
      const node: EsNode = { type: 'AssignmentExpression', left: { type: 'MemberExpression' } };

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([{ parameters: [{ node, message }] }]);

      rule.create({ report }).AssignmentExpression(node);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores assignment to identifier', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      rule.create({ report }).AssignmentExpression({ type: 'AssignmentExpression', left: identifier('value') });

      expect(reportMocks.length).toBe(0);
    });

    test('reports update of member expression', () => {
      const node: EsNode = { type: 'UpdateExpression', argument: { type: 'MemberExpression' } };

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([{ parameters: [{ node, message }] }]);

      rule.create({ report }).UpdateExpression(node);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores update of identifier', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      rule.create({ report }).UpdateExpression({ type: 'UpdateExpression', argument: identifier('value') });

      expect(reportMocks.length).toBe(0);
    });

    test('reports delete of member expression', () => {
      const node: EsNode = { type: 'UnaryExpression', operator: 'delete', argument: { type: 'MemberExpression' } };

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([{ parameters: [{ node, message }] }]);

      rule.create({ report }).UnaryExpression(node);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores other unary expressions', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.UnaryExpression({ type: 'UnaryExpression', operator: 'typeof', argument: { type: 'MemberExpression' } });
      handlers.UnaryExpression({ type: 'UnaryExpression', operator: 'delete', argument: identifier('value') });

      expect(reportMocks.length).toBe(0);
    });

    test('reports array mutators on mutable targets', () => {
      const onIdentifier = objectCall(identifier('list'), identifier('push'), [identifier('value')]);
      const onMember = objectCall({ type: 'MemberExpression' }, identifier('sort'), []);
      const onThis = objectCall({ type: 'ThisExpression' }, identifier('splice'), []);

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([
        { parameters: [{ node: onIdentifier, message }] },
        { parameters: [{ node: onMember, message }] },
        { parameters: [{ node: onThis, message }] },
      ]);

      const handlers = rule.create({ report });

      handlers.CallExpression(onIdentifier);
      handlers.CallExpression(onMember);
      handlers.CallExpression(onThis);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores array mutators on fresh values and non mutating methods', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.CallExpression(objectCall({ type: 'ArrayExpression' }, identifier('reverse'), []));
      handlers.CallExpression(objectCall(identifier('list'), identifier('map'), []));

      expect(reportMocks.length).toBe(0);
    });

    test('reports Object mutators on existing values', () => {
      const node = objectCall(identifier('Object'), identifier('assign'), [identifier('target')]);

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([{ parameters: [{ node, message }] }]);

      rule.create({ report }).CallExpression(node);

      expect(reportMocks.length).toBe(0);
    });

    test('ignores Object mutators on fresh values', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.CallExpression(objectCall(identifier('Object'), identifier('assign'), [{ type: 'ObjectExpression' }]));
      handlers.CallExpression(objectCall(identifier('Object'), identifier('assign'), []));
      handlers.CallExpression(objectCall(identifier('Object'), identifier('keys'), [identifier('value')]));

      expect(reportMocks.length).toBe(0);
    });

    test('ignores calls without a matching callee shape', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.CallExpression(callTo('push', [identifier('value')]));
      handlers.CallExpression(objectCall(identifier('list'), identifier('push'), [], true));
      handlers.CallExpression(objectCall(identifier('list'), { type: 'PrivateIdentifier' }, []));

      expect(reportMocks.length).toBe(0);
    });
  });

  describe('prefer-tacit', () => {
    const rule = plugin.rules['prefer-tacit'];

    test('meta', () => {
      expect(rule.meta.type).toBe('suggestion');
    });

    test('reports wrapper around declared arrow function', () => {
      const wrapper = arrow([identifier('value')], callTo('double', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([
        {
          parameters: [{ node: wrapper, message: 'This function is equivalent to `double`. Use it directly instead.' }],
        },
      ]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: arrow([identifier('value')], identifier('value')),
      });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('reports block bodied wrapper around function declaration', () => {
      const wrapper: EsNode = {
        type: 'FunctionExpression',
        params: [identifier('value')],
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ReturnStatement', argument: callTo('double', [identifier('value')]) }],
        },
      };

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([
        {
          parameters: [{ node: wrapper, message: 'This function is equivalent to `double`. Use it directly instead.' }],
        },
      ]);

      const handlers = rule.create({ report });

      handlers.FunctionDeclaration({
        type: 'FunctionDeclaration',
        id: identifier('double'),
        params: [identifier('value')],
        body: { type: 'BlockStatement', body: [] },
      });
      handlers.FunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores declarations without usable shape', () => {
      const wrapper = arrow([identifier('value')], callTo('double', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.FunctionDeclaration({
        type: 'FunctionDeclaration',
        id: null,
        params: [],
        body: { type: 'BlockStatement', body: [] },
      });
      handlers.FunctionDeclaration({ type: 'FunctionDeclaration', id: identifier('double'), params: [] });
      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: { type: 'ObjectPattern' },
        init: arrow([], identifier('value')),
      });
      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: callTo('factory', []),
      });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores wrapper around function declared multiple times', () => {
      const wrapper = arrow([identifier('value')], callTo('double', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: arrow([identifier('value')], identifier('value')),
      });
      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: arrow([identifier('value')], identifier('value')),
      });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores wrapper around function with non plain parameters', () => {
      const wrapper = arrow([identifier('value')], callTo('double', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: arrow([{ type: 'ObjectPattern' }], identifier('value')),
      });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores self referencing wrapper', () => {
      const wrapper = arrow([identifier('value')], callTo('recurse', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({ type: 'VariableDeclarator', id: identifier('recurse'), init: wrapper });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores wrapper with arity mismatch against declaration', () => {
      const wrapper = arrow([identifier('value')], callTo('add', [identifier('value')]));

      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('add'),
        init: arrow([identifier('left'), identifier('right')], identifier('left')),
      });
      handlers.ArrowFunctionExpression(wrapper);
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores wrapper around undeclared function', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.ArrowFunctionExpression(arrow([identifier('value')], callTo('unknown', [identifier('value')])));
      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });

    test('ignores functions which are no tacit wrappers', () => {
      const [report, reportMocks] = useFunctionMock<RuleContext['report']>([]);

      const handlers = rule.create({ report });

      handlers.VariableDeclarator({
        type: 'VariableDeclarator',
        id: identifier('double'),
        init: arrow([identifier('value')], identifier('value')),
      });

      handlers.ArrowFunctionExpression({
        ...arrow([identifier('value')], callTo('double', [identifier('value')])),
        async: true,
      });
      handlers.FunctionExpression({
        type: 'FunctionExpression',
        generator: true,
        params: [identifier('value')],
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ReturnStatement', argument: callTo('double', [identifier('value')]) }],
        },
      });
      handlers.ArrowFunctionExpression({ type: 'ArrowFunctionExpression', body: callTo('double', []) });
      handlers.ArrowFunctionExpression({ type: 'ArrowFunctionExpression', params: [identifier('value')], body: null });
      handlers.ArrowFunctionExpression(arrow([identifier('value')], identifier('value')));
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], {
          type: 'BlockStatement',
          body: [
            { type: 'ExpressionStatement' },
            { type: 'ReturnStatement', argument: callTo('double', [identifier('value')]) },
          ],
        }),
      );
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], { type: 'BlockStatement', body: [{ type: 'ExpressionStatement' }] }),
      );
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: null }] }),
      );
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], {
          type: 'CallExpression',
          callee: { type: 'MemberExpression', object: identifier('math'), property: identifier('double') },
          arguments: [identifier('value')],
        }),
      );
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], { ...callTo('double', [identifier('value')]), optional: true }),
      );
      handlers.ArrowFunctionExpression(arrow([], callTo('double', [])));
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], { type: 'CallExpression', callee: identifier('double') }),
      );
      handlers.ArrowFunctionExpression(
        arrow([identifier('value')], callTo('double', [identifier('value'), identifier('other')])),
      );
      handlers.ArrowFunctionExpression(arrow([{ type: 'ObjectPattern' }], callTo('double', [identifier('value')])));
      handlers.ArrowFunctionExpression(arrow([identifier('value')], callTo('double', [identifier('other')])));
      handlers.ArrowFunctionExpression(arrow([identifier('value')], callTo('double', [{ type: 'Literal' }])));

      handlers['Program:exit']({ type: 'Program' });

      expect(reportMocks.length).toBe(0);
    });
  });
});
