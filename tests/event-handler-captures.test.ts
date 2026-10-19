import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function eventCaptures(source: string, filename: string): number[] {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node, handlers: ReadonlyMap<string, ts.Node>): void => {
    const scope = new Map(handlers);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      for (const parameter of node.parameters) {
        if (!ts.isIdentifier(parameter.name)) continue;
        scope.delete(parameter.name.text);
        if (/^(event|e|ev)$/.test(parameter.name.text)) scope.set(parameter.name.text, node);
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
      ['currentTarget', 'target', 'nativeEvent'].includes(node.name.text)) {
      const handler = scope.get(node.expression.text);
      if (handler) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && parent !== handler) {
          if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent) || ts.isFunctionDeclaration(parent)) {
            lines.push(ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1);
            break;
          }
          parent = parent.parent;
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };
  visit(ast, new Map());
  return lines;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

it('detects event reads inside updater closures and allows captured primitive values', () => {
  expect(eventCaptures('const change = (event) => update(current => ({ ...current, value: event.currentTarget.value }));', 'sample.tsx')).toEqual([1]);
  expect(eventCaptures('const change = (event) => { const value = event.currentTarget.value; update(current => ({ ...current, value })); };', 'sample.tsx')).toEqual([]);
  expect(eventCaptures('const change = (event) => setValue(event.currentTarget.value);', 'sample.tsx')).toEqual([]);
});

it('captures event values before entering nested callbacks throughout the UI', () => {
  const root = join(process.cwd(), 'apps', 'web', 'src');
  const captures = sourceFiles(root).flatMap((file) => eventCaptures(readFileSync(file, 'utf8'), file)
    .map((line) => `${relative(root, file)}:${line}`));
  expect(captures).toEqual([]);
});
