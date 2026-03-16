import { describe, it, expect } from 'vitest'
import { sanitizeMermaidChart, quoteMermaidLabels } from './sanitize-mermaid'

describe('quoteMermaidLabels', () => {
  it('quotes labels with colons', () => {
    const input = `graph TD
  A[Step 1: Init] --> B[Step 2: Run]`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A["Step 1: Init"] --> B["Step 2: Run"]`)
  })

  it('quotes labels with ampersands', () => {
    const input = `graph LR
  A[Auth & Access] --> B[Read & Write]`
    expect(quoteMermaidLabels(input)).toBe(`graph LR
  A["Auth & Access"] --> B["Read & Write"]`)
  })

  it('quotes labels with slashes', () => {
    const input = `graph TD
  A[A/B Test Design] --> B[VPC/Networking]`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A["A/B Test Design"] --> B["VPC/Networking"]`)
  })

  it('quotes labels with <br/> tags', () => {
    const input = `graph TD
  A[Line 1<br/>Line 2] --> B[OK]`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A["Line 1<br/>Line 2"] --> B["OK"]`)
  })

  it('leaves already-quoted labels alone', () => {
    const input = `graph TD
  A["Already quoted"] --> B["Also quoted"]`
    expect(quoteMermaidLabels(input)).toBe(input)
  })

  it('quotes multiple nodes on one line', () => {
    const input = `  A[Node: A] --> B[Node: B] --> C[Node: C]`
    expect(quoteMermaidLabels(input)).toBe(`  A["Node: A"] --> B["Node: B"] --> C["Node: C"]`)
  })

  it('does not modify edge labels', () => {
    const input = `graph TD
  A["Start"] -->|yes: go| B["End"]`
    expect(quoteMermaidLabels(input)).toBe(input)
  })

  it('does not modify directive lines', () => {
    const input = `graph TD
  A[Hello] --> B[World]
  end`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A["Hello"] --> B["World"]
  end`)
  })

  it('quotes simple labels too (universal quoting)', () => {
    const input = `graph TD
  A[Start] --> B[End]`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A["Start"] --> B["End"]`)
  })

  it('handles rounded nodes', () => {
    const input = `graph TD
  A(Rounded Node)`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A("Rounded Node")`)
  })

  it('handles diamond nodes', () => {
    const input = `graph TD
  A{Decision: Yes?}`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A{"Decision: Yes?"}`)
  })

  it('handles subroutine nodes', () => {
    const input = `graph TD
  A[[Subroutine: Init]]`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A[["Subroutine: Init"]]`)
  })

  it('handles double circle nodes', () => {
    const input = `graph TD
  A((Double Circle))`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A(("Double Circle"))`)
  })

  it('handles hexagon nodes', () => {
    const input = `graph TD
  A{{Hexagon: Node}}`
    expect(quoteMermaidLabels(input)).toBe(`graph TD
  A{{"Hexagon: Node"}}`)
  })

  it('skips subgraph lines', () => {
    const input = `  subgraph cluster1[Group Name]`
    expect(quoteMermaidLabels(input)).toBe(input)
  })

  it('skips comment lines', () => {
    const input = `  %% This is a comment`
    expect(quoteMermaidLabels(input)).toBe(input)
  })
})

describe('sanitizeMermaidChart', () => {
  it('strips style directives', () => {
    const input = `graph TD
  A[Start] --> B[End]
  style A fill:#e1f5fe,stroke:#333
  style B fill:#fff3e0`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A["Start"] --> B["End"]`)
  })

  it('strips classDef directives', () => {
    const input = `graph TD
  classDef highlight fill:#fff3e0,stroke:#999
  A[Start] --> B[End]`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A["Start"] --> B["End"]`)
  })

  it('strips class assignment directives', () => {
    const input = `graph TD
  A[Start] --> B[End]
  class A,B highlight`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A["Start"] --> B["End"]`)
  })

  it('removes :::className from node definitions', () => {
    const input = `graph TD
  A[Start]:::highlight --> B[End]:::muted`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A["Start"] --> B["End"]`)
  })

  it('handles mixed color injection vectors', () => {
    const input = `graph LR
  classDef blue fill:#e1f5fe
  A[Node A]:::blue --> B[Node B]
  style A fill:#e1f5fe,stroke:#333
  class B blue`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph LR
  A["Node A"] --> B["Node B"]`)
  })

  it('preserves non-color directives', () => {
    const input = `graph TD
  A[Start] --> B[Decision]
  B -->|Yes| C[End]
  B -->|No| D[Loop]
  D --> A`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A["Start"] --> B["Decision"]
  B -->|Yes| C["End"]
  B -->|No| D["Loop"]
  D --> A`)
  })

  it('is case-insensitive for directives', () => {
    const input = `graph TD
  A --> B
  Style A fill:#fff
  CLASSDEF foo fill:#000
  CLASS A foo`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A --> B`)
  })

  it('handles empty input', () => {
    expect(sanitizeMermaidChart('')).toBe('')
  })

  it('preserves subgraph and other keywords', () => {
    const input = `graph TD
  subgraph cluster1[Group]
    A --> B
  end`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(input)
  })
})
