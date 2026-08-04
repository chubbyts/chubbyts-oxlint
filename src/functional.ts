export type EsNode = {
  type: string;
  kind?: string;
  name?: string;
  operator?: string;
  computed?: boolean;
  async?: boolean;
  generator?: boolean;
  optional?: boolean;
  id?: EsNode | null;
  init?: EsNode | null;
  left?: EsNode;
  argument?: EsNode | null;
  callee?: EsNode;
  object?: EsNode;
  property?: EsNode;
  body?: EsNode | Array<EsNode> | null;
  params?: Array<EsNode>;
  arguments?: Array<EsNode>;
  declarations?: Array<EsNode>;
};

export type RuleContext = {
  report: (descriptor: { node: EsNode; message: string }) => void;
};

export type Rule = {
  meta: { type: string; docs: { description: string } };
  create: (context: RuleContext) => Record<string, (node: EsNode) => void>;
};

const noLet: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow mutable variables. Syntactic port of functional/no-let from eslint-plugin-functional.',
    },
  },
  create: (context) => ({
    VariableDeclaration: (node) => {
      if (node.kind === 'let') {
        context.report({ node, message: 'Unexpected let, use const instead.' });
      }
    },
  }),
};

const ARRAY_MUTATORS = new Set(['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift']);

const OBJECT_MUTATORS = new Set(['assign', 'defineProperties', 'defineProperty', 'setPrototypeOf']);

const MUTABLE_TARGET_TYPES = new Set(['Identifier', 'MemberExpression', 'ThisExpression']);

const immutableData: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow mutating objects and arrays. Syntactic approximation of functional/immutable-data from eslint-plugin-functional: mutations of existing values are detected structurally, without type information.',
    },
  },
  create: (context) => ({
    AssignmentExpression: (node) => {
      if (node.left?.type === 'MemberExpression') {
        context.report({ node, message: 'Modifying an existing object/array is not allowed.' });
      }
    },
    UpdateExpression: (node) => {
      if (node.argument?.type === 'MemberExpression') {
        context.report({ node, message: 'Modifying an existing object/array is not allowed.' });
      }
    },
    UnaryExpression: (node) => {
      if (node.operator === 'delete' && node.argument?.type === 'MemberExpression') {
        context.report({ node, message: 'Modifying an existing object/array is not allowed.' });
      }
    },
    CallExpression: (node) => {
      const callee = node.callee;

      if (callee?.type !== 'MemberExpression' || callee.computed || callee.property?.type !== 'Identifier') {
        return;
      }

      const methodName = callee.property.name as string;
      const object = callee.object;

      if (object?.type === 'Identifier' && object.name === 'Object' && OBJECT_MUTATORS.has(methodName)) {
        const firstArgument = node.arguments?.[0];

        if (firstArgument && firstArgument.type !== 'ObjectExpression' && firstArgument.type !== 'ArrayExpression') {
          context.report({ node, message: 'Modifying an existing object/array is not allowed.' });
        }

        return;
      }

      if (ARRAY_MUTATORS.has(methodName) && object && MUTABLE_TARGET_TYPES.has(object.type)) {
        context.report({ node, message: 'Modifying an existing object/array is not allowed.' });
      }
    },
  }),
};

type DeclaredFunction = {
  node: EsNode;
  arity: number;
  plain: boolean;
};

const hasOnlyPlainParams = (params: Array<EsNode>): boolean => params.every((param) => param.type === 'Identifier');

const wrappedCall = (wrapper: EsNode): EsNode | undefined => {
  if (wrapper.async || wrapper.generator || !wrapper.params) {
    return undefined;
  }

  const body = wrapper.body;

  if (!body || Array.isArray(body)) {
    return undefined;
  }

  if (body.type === 'CallExpression') {
    return body;
  }

  if (body.type === 'BlockStatement' && Array.isArray(body.body) && body.body.length === 1) {
    const statement = body.body[0];

    if (statement.type === 'ReturnStatement' && statement.argument?.type === 'CallExpression') {
      return statement.argument;
    }
  }

  return undefined;
};

const isTacitWrapper = (wrapper: EsNode, call: EsNode): boolean => {
  if (call.callee?.type !== 'Identifier' || call.optional) {
    return false;
  }

  const params = wrapper.params as Array<EsNode>;
  const callArguments = call.arguments;

  if (!callArguments || params.length === 0 || params.length !== callArguments.length || !hasOnlyPlainParams(params)) {
    return false;
  }

  return params.every((param, index) => {
    const argument = callArguments[index];

    return argument.type === 'Identifier' && argument.name === param.name;
  });
};

const preferTacit: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest using a function directly instead of wrapping it. Syntactic approximation of functional/prefer-tacit from eslint-plugin-functional: only functions declared in the same file with a matching, fixed arity are reported.',
    },
  },
  create: (context) => {
    const declared = new Map<string, DeclaredFunction>();
    const wrappers = new Map<EsNode, EsNode>();

    const register = (name: string, node: EsNode, params: Array<EsNode>): void => {
      declared.set(name, { node, arity: params.length, plain: !declared.has(name) && hasOnlyPlainParams(params) });
    };

    const collectWrapper = (node: EsNode): void => {
      const call = wrappedCall(node);

      if (call && isTacitWrapper(node, call)) {
        wrappers.set(node, call);
      }
    };

    return {
      FunctionDeclaration: (node) => {
        if (node.id?.type === 'Identifier' && node.body && node.params) {
          register(node.id.name as string, node, node.params);
        }
      },
      VariableDeclarator: (node) => {
        if (
          node.id?.type === 'Identifier' &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression') &&
          node.init.params
        ) {
          register(node.id.name as string, node.init, node.init.params);
        }
      },
      ArrowFunctionExpression: collectWrapper,
      FunctionExpression: collectWrapper,
      'Program:exit': () => {
        wrappers.forEach((call, node) => {
          const calleeName = call.callee?.name as string;
          const declaration = declared.get(calleeName);

          if (
            !declaration ||
            !declaration.plain ||
            declaration.node === node ||
            declaration.arity !== (call.arguments as Array<EsNode>).length
          ) {
            return;
          }

          context.report({
            node,
            message: `This function is equivalent to \`${calleeName}\`. Use it directly instead.`,
          });
        });
      },
    };
  },
};

const plugin = {
  meta: {
    name: '@chubbyts/chubbyts-oxlint-functional',
  },
  rules: {
    'no-let': noLet,
    'immutable-data': immutableData,
    'prefer-tacit': preferTacit,
  },
};

export default plugin;
