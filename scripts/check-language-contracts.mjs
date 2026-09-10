import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const languages = ['en', 'sv', 'es', 'fr', 'zh'];
const propertyName = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) ? node.text : null;
function unwrap(node, bindings, seen = new Set()) {
  if (!node) return node;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return unwrap(node.expression, bindings, seen);
  if (ts.isIdentifier(node) && bindings.has(node.text) && !seen.has(node.text)) return unwrap(bindings.get(node.text), bindings, new Set([...seen, node.text]));
  if (ts.isPropertyAccessExpression(node)) return unwrap(fields(node.expression, bindings, seen).get(node.name.text), bindings, seen) ?? node;
  return node;
}
function fields(node, bindings, seen = new Set()) {
  const value = unwrap(node, bindings, seen), result = new Map();
  if (!value || !ts.isObjectLiteralExpression(value)) return result;
  for (const field of value.properties) {
    if (ts.isSpreadAssignment(field)) for (const [key, entry] of fields(field.expression, bindings, seen)) result.set(key, entry);
    else if (ts.isPropertyAssignment(field) && propertyName(field.name) !== null) result.set(propertyName(field.name), field.initializer);
    else if (ts.isShorthandPropertyAssignment(field)) result.set(field.name.text, field.name);
  }
  return result;
}
function strings(input, bindings, prefix = '', result = new Map()) {
  const node = unwrap(input, bindings);
  if (!node) return result;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) result.set(prefix, node.text);
  else if (ts.isObjectLiteralExpression(node)) for (const [key, value] of fields(node, bindings)) strings(value, bindings, `${prefix}.${key}`, result);
  else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((field, index) => strings(field, bindings, `${prefix}[${index}]`, result));
  return result;
}
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
const placeholders = text => [...new Set([...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map(match => match[1]))].sort().join(',');
export function auditLanguageContracts(directory = path.join(root, 'src')) {
  const dictionaries = [], issues = [];
  for (const file of files(directory)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const bindings = new Map();
    function bind(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bindings.set(node.name.text, node.initializer);
      ts.forEachChild(node, bind);
    }
    bind(source);
    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        const dictionary = fields(node, bindings);
        const english = unwrap(dictionary.get('en'), bindings);
        if (english && ts.isObjectLiteralExpression(english)) {
          const sourceStrings = strings(english, bindings);
          const relative = path.relative(root, file).replaceAll('\\', '/');
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          const found = languages.filter(language => dictionary.has(language));
          dictionaries.push({ file: relative, line, languages: found, missingLocales: languages.filter(language => !dictionary.has(language)), englishStrings: sourceStrings.size });
          for (const language of languages.filter(language => !dictionary.has(language))) issues.push({ file: relative, line, language, key: '', issue: 'missing locale' });
          for (const language of found.filter(language => language !== 'en')) {
            const locale = unwrap(dictionary.get(language), bindings);
            if (!locale) continue;
            if (!ts.isObjectLiteralExpression(locale)) continue;
            const translated = strings(locale, bindings);
            for (const [key, value] of sourceStrings) {
              if (!translated.has(key)) issues.push({ file: relative, line, language, key, issue: 'missing string' });
              else if (placeholders(value) !== placeholders(translated.get(key))) issues.push({ file: relative, line, language, key, issue: 'placeholder mismatch' });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { dictionaries, issues };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditLanguageContracts();
  if (process.argv.includes('--inventory')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const issue of report.issues) console.error(JSON.stringify(issue));
    console.log(`Language contracts: ${report.dictionaries.length} English-source dictionaries; ${report.issues.length} key/placeholder mismatches.`);
    if (report.issues.length) process.exitCode = 1;
  }
}
