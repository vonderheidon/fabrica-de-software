import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const moduleRoot = 'apps/controller/src/modules/';
const normalize = (path) => path.replaceAll('\\', '/');
const moduleOf = (path) => normalize(path).startsWith(moduleRoot) ? normalize(path).slice(moduleRoot.length).split('/')[0] : undefined;

/** Static boundaries for production sources. Test fixtures can exercise private seams. */
export function inspectSource(filename, source) {
  const file = normalize(filename);
  const owner = moduleOf(file);
  const contracts = file.startsWith('packages/contracts/src/');
  const errors = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const report = (message) => { errors.push(`${file}: ${message}`); };
  const inspectImport = (specifier) => {
    if (contracts && specifier !== '@sinclair/typebox' && !(specifier.startsWith('.') && normalize(relative(root, resolve(root, dirname(file), specifier))).startsWith('packages/contracts/src/'))) report('contracts must contain schemas/types only; IO/runtime imports are forbidden');
    if ((specifier === 'better-sqlite3' || specifier.startsWith('better-sqlite3/')) && owner !== 'storage') report('SQLite belongs to storage');
    if (specifier.startsWith('@oh-my-pi/') && owner !== 'execution') report('OMP belongs to execution');
    if (specifier.startsWith('#') && specifier !== '#contracts') report('unknown import alias');
    if (!specifier.startsWith('.')) {
      if (specifier.startsWith('@factory/') || specifier.startsWith('apps/') || specifier.startsWith('packages/')) report('use the declared public interface');
      return;
    }
    const target = normalize(relative(root, resolve(root, dirname(file), specifier)));
    const targetOwner = moduleOf(target);
    if (targetOwner && targetOwner !== owner && target !== `${moduleRoot}${targetOwner}/index.js`) report('cross-module imports must use index.js');
    if (!contracts && target.startsWith('packages/contracts/') && target !== 'packages/contracts/src/index.js') report('contracts internals are private');
    if (owner && target.startsWith('apps/controller/src/') && !targetOwner) report('modules cannot import HTTP or the composition root');
    if (target.startsWith('../')) report('imports outside the repository are forbidden');
  };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) report('explicit any is forbidden');
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspectImport(node.moduleSpecifier.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) inspectImport(node.argument.literal.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) inspectImport(argument.text);
      else report('computed module imports cannot be checked');
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(node.expression.text)) {
      const command = node.arguments[0];
      if (command && ts.isStringLiteral(command)) {
        if (/(?:^|[\\/])gh(?:\.exe)?$/i.test(command.text) && owner !== 'github') report('GH belongs to github');
        if (/(?:^|[\\/])git(?:\.exe)?$/i.test(command.text) && owner !== 'workspaces') report('Git belongs to workspaces');
        if (/(?:^|[\\/])(?:maestri|omp)(?:\.(?:exe|cmd|bat))?$/i.test(command.text) && owner !== 'execution') report('Maestri/OMP belongs to execution');
      }
    }
    if (owner !== 'storage' && (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
      if (/\b(?:SELECT\s+.+?\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|PRAGMA\s+\w+)/is.test(node.text)) report('SQL belongs to storage');
    }
    if (contracts && (ts.isIdentifier(node) && ['process', 'fetch', 'globalThis', 'require'].includes(node.text))) report('contracts cannot access runtime globals');
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (/@ts-(?:ignore|nocheck)\b/.test(source)) report('TypeScript suppression is forbidden');
  return [...new Set(errors)];
}

export function inspectTree(directory) {
  const errors = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) errors.push(...inspectTree(path));
    else if (entry.name.endsWith('.sql') && moduleOf(normalize(relative(root, path))) !== 'storage') errors.push(`${path}: SQL belongs to storage`);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) errors.push(...inspectSource(relative(root, path), readFileSync(path, 'utf8')));
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = ['apps/controller/src', 'packages/contracts/src'].flatMap((path) => inspectTree(resolve(root, path)));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Module boundaries and TypeScript conventions: OK');
}
