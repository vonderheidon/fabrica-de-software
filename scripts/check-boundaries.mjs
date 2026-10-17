import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const moduleRoot = 'apps/controller/src/modules/';
const nodeModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const normalize = (path) => path.replaceAll('\\', '/');
const moduleOf = (path) => normalize(path).startsWith(moduleRoot) ? normalize(path).slice(moduleRoot.length).split('/')[0] : undefined;

/** Static boundaries for production sources. Test fixtures can exercise private seams. */
export function inspectSource(filename, source) {
  const file = normalize(filename);
  const owner = moduleOf(file);
  const contracts = file.startsWith('packages/contracts/src/');
  const web = file.startsWith('apps/web/src/');
  const errors = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const launchers = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']);
  const shellLaunchers = new Set(['exec', 'execSync']);
  const namespaces = new Set();
  const literalCommands = new Map();
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && /^(?:node:)?child_process$/.test(statement.moduleSpecifier.text)) {
      const clause = statement.importClause;
      if (clause?.name) namespaces.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if (launchers.has((element.propertyName ?? element.name).text)) launchers.add(element.name.text);
        if (shellLaunchers.has((element.propertyName ?? element.name).text)) shellLaunchers.add(element.name.text);
      }
    }
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isStringLiteralLike(declaration.initializer)) literalCommands.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
  const report = (message) => { errors.push(`${file}: ${message}`); };
  const inspectImport = (specifier) => {
    if (web && (nodeModules.has(specifier) || /^(?:node:|better-sqlite3(?:\/|$)|@oh-my-pi\/)/.test(specifier))) report('UI cannot import server IO/runtime');
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
    if (web && target.startsWith('apps/controller/')) report('UI cannot import controller runtime');
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
    if (ts.isExternalModuleReference(node) && node.expression && ts.isStringLiteral(node.expression)) inspectImport(node.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) inspectImport(argument.text);
      else report('computed module imports cannot be checked');
    }
    const expression = ts.isCallExpression(node) ? node.expression : undefined;
    const member = expression && (ts.isPropertyAccessExpression(expression) ? expression.name.text :
      ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression) ? expression.argumentExpression.text : undefined);
    const namespaceCall = member && launchers.has(member) && ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text);
    if (expression && ((ts.isIdentifier(expression) && launchers.has(expression.text)) || namespaceCall)) {
      const command = node.arguments[0];
      const literal = command && (ts.isStringLiteralLike(command) ? command.text : ts.isIdentifier(command) ? literalCommands.get(command.text) : undefined);
      // Recognize a literal leading executable, including exec('gh api ...'). This is
      // a source boundary check, not a shell parser or a subprocess sandbox.
      const shell = ts.isIdentifier(expression) ? shellLaunchers.has(expression.text) : shellLaunchers.has(member);
      const executable = literal && (shell ? /^\s*"([^"]+)"(?:\s|$)|^\s*'([^']+)'(?:\s|$)|^\s*(\S+)/.exec(literal)?.slice(1).find(Boolean) : literal);
      if (executable) {
        if (/(?:^|[\\/])gh(?:\.(?:exe|cmd|bat))?$/i.test(executable) && owner !== 'github') report('GH belongs to github');
        if (/(?:^|[\\/])git(?:\.(?:exe|cmd|bat))?$/i.test(executable) && owner !== 'workspaces') report('Git belongs to workspaces');
        if (/(?:^|[\\/])(?:maestri|omp)(?:\.(?:exe|cmd|bat))?$/i.test(executable) && owner !== 'execution') report('Maestri/OMP belongs to execution');
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
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) errors.push(...inspectSource(relative(root, path), readFileSync(path, 'utf8')));
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = ['apps/controller/src', 'apps/web/src', 'packages/contracts/src'].flatMap((path) => inspectTree(resolve(root, path)));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Module boundaries and TypeScript conventions: OK');
}
