/**
 * Find buttons that render an icon and nothing else, with no accessible name.
 *
 * A screen reader announces such a control as just "button". A grep cannot
 * answer this question, because a button holding both an icon and a text label
 * looks identical to a grep, so this walks the JSX and asks the real question,
 * does this control have any text a screen reader can announce, whether from
 * its children or from an aria-label.
 *
 * Run it from the repo root:
 *   pnpm exec tsx scripts/find-unnamed-buttons.mts
 *
 * It exits non-zero when anything is unnamed, so it can be wired into CI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const ROOT = process.argv[2] ?? 'client'

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-electron') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * Whether an expression in child position can put readable text on screen.
 *
 * Read this before simplifying it. An earlier version asked whether the
 * expression's source text contained a double quote, on the theory that a
 * string literal implies visible copy. That is wrong in a way that hides real
 * problems. A ternary choosing between two icons, which is the single most
 * common shape for a submit button that swaps in a spinner, is entirely quote
 * laden, because both branches carry className strings. Every button of that
 * shape was therefore reported as already named, and one genuinely unnamed
 * send button stayed hidden behind that false negative until the check was
 * rewritten to recurse into the branches instead.
 */
function expressionCanRender(node: ts.Expression): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return ts.isJsxElement(node) ? visibleText(node.children) !== '' : false
  }
  if (ts.isConditionalExpression(node)) {
    return expressionCanRender(node.whenTrue) || expressionCanRender(node.whenFalse)
  }
  if (ts.isBinaryExpression(node)) {
    return expressionCanRender(node.right)
  }
  if (ts.isParenthesizedExpression(node)) {
    return expressionCanRender(node.expression)
  }
  // A literal, a variable, a call or a property access can all resolve to text.
  return true
}

/** Any text a screen reader could read out of this element's children. */
function visibleText(children: ts.NodeArray<ts.JsxChild>): string {
  let text = ''
  for (const child of children) {
    if (ts.isJsxText(child)) text += child.text.trim()
    else if (ts.isJsxExpression(child) && child.expression) text += expressionCanRender(child.expression) ? 'expr' : ''
    else if (ts.isJsxElement(child)) text += visibleText(child.children)
  }
  return text.trim()
}

const hasAttribute = (element: ts.JsxOpeningLikeElement, name: string): boolean =>
  element.attributes.properties.some(
    property => ts.isJsxAttribute(property) && property.name.getText() === name,
  )

let unnamed = 0
for (const file of collect(ROOT)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText()
      if (tag === 'button' || tag === 'Button') {
        // title counts, since a browser exposes it as the accessible name when
        // nothing better is present.
        const named = hasAttribute(node.openingElement, 'aria-label') || hasAttribute(node.openingElement, 'title')
        if (!named && visibleText(node.children) === '') {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
          console.log(`${file}:${line + 1}`)
          unnamed++
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

console.log(`\n${unnamed} buttons render without any accessible name`)
process.exit(unnamed === 0 ? 0 : 1)
