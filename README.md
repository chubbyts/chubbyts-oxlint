# chubbyts-oxlint

[![CI](https://github.com/chubbyts/chubbyts-oxlint/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/chubbyts/chubbyts-oxlint/actions/workflows/ci.yml)
[![npm-version](https://img.shields.io/npm/v/@chubbyts/chubbyts-oxlint.svg)](https://www.npmjs.com/package/@chubbyts/chubbyts-oxlint)

[![bugs](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=bugs)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![code_smells](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=code_smells)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![duplicated_lines_density](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=duplicated_lines_density)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![ncloc](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=ncloc)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![sqale_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=sqale_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![alert_status](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=alert_status)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![reliability_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=reliability_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![security_rating](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=security_rating)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![sqale_index](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=sqale_index)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)
[![vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=chubbyts_chubbyts-oxlint&metric=vulnerabilities)](https://sonarcloud.io/dashboard?id=chubbyts_chubbyts-oxlint)

## Description

Oxlint Configuration for chubbyts libraries / framework / projects. Provides the same linting contract as
[@chubbyts/chubbyts-eslint][9], as close as [oxlint][3] allows.

## Requirements

 * node: 22
 * [oxlint][3]: ^1.76.0 (peer dependency)
 * [oxc-resolver][4]: ^11.24.2

## Installation

Through [NPM](https://www.npmjs.com) as [@chubbyts/chubbyts-oxlint][1].

```sh
npm i -D oxlint @chubbyts/chubbyts-oxlint@^1.0.1
```

## Configuration

### .oxlintrc.json

```json
{
  "extends": ["./node_modules/@chubbyts/chubbyts-oxlint/oxlintrc.json"]
}
```

### package.json

```json
{
  "scripts": {
    "lint": "oxlint src tests",
    "lint-fix": "oxlint --fix src tests"
  }
}
```

## Differences to chubbyts-eslint

Most rules map 1:1 onto oxlint's native (Rust) implementations. The remaining rules are provided by JS plugins
which are shipped with this package:

 * `functional/no-let`, `functional/immutable-data`, `functional/prefer-tacit`: syntactic reimplementations of the
   rules from [eslint-plugin-functional][6]. Oxlint does not provide typescript-eslint parser services to JS plugins,
   so the type-aware originals cannot run. `immutable-data` detects mutations structurally (member assignments,
   `delete`, mutating array methods, `Object.assign` and friends on existing values) and therefore cannot detect
   `Map`/`Set` mutations. `prefer-tacit` only reports wrappers around functions declared in the same file with a
   matching, fixed arity.
 * `importx/order`, `importx/no-unresolved`: reimplementations of the [eslint-plugin-import-x][5] rules on top of
   [oxc-resolver][4] (the resolver oxlint itself uses, configured for TypeScript: `.ts` extensions, `.js` → `.ts`
   extension alias, tsconfig paths), keeping this package free of the eslint ecosystem and its typescript version
   constraint. `order` implements the default options only (builtin, external, parent, sibling, index). The
   `import-x` plugin name is reserved by oxlint for its native rules, hence the `importx` alias.
 * `quotes`, `semi` and `linebreak-style` do not exist in oxlint; formatting is owned by prettier in all chubbyts
   projects anyway.
 * `eslint.configs.recommended` and the non-type-aware part of `tseslint.configs.strict` are covered by the
   `correctness` and `suspicious` categories plus explicitly enabled `typescript/*` rules.
 * `unused-imports/no-unused-imports` is covered by oxlint's `eslint/no-unused-vars`, which reports and auto-fixes
   unused imports.

Type-aware linting (beyond the syntactic approximations above) can be added by installing [oxlint-tsgolint][7] and
running `oxlint --type-aware`.

## Copyright

2026 Dominik Zogg

[1]: https://www.npmjs.com/package/@chubbyts/chubbyts-oxlint
[3]: https://www.npmjs.com/package/oxlint
[4]: https://www.npmjs.com/package/oxc-resolver
[5]: https://www.npmjs.com/package/eslint-plugin-import-x
[6]: https://www.npmjs.com/package/eslint-plugin-functional
[7]: https://www.npmjs.com/package/oxlint-tsgolint
[9]: https://www.npmjs.com/package/@chubbyts/chubbyts-eslint
