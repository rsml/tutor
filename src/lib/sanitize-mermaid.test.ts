import { describe, it, expect } from 'vitest'
import { sanitizeMermaidChart } from './sanitize-mermaid'

describe('sanitizeMermaidChart', () => {
  it('strips style directives', () => {
    const input = `graph TD
  A[Start] --> B[End]
  style A fill:#e1f5fe,stroke:#333
  style B fill:#fff3e0`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A[Start] --> B[End]`)
  })

  it('strips classDef directives', () => {
    const input = `graph TD
  classDef highlight fill:#fff3e0,stroke:#999
  A[Start] --> B[End]`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A[Start] --> B[End]`)
  })

  it('strips class assignment directives', () => {
    const input = `graph TD
  A[Start] --> B[End]
  class A,B highlight`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A[Start] --> B[End]`)
  })

  it('removes :::className from node definitions', () => {
    const input = `graph TD
  A[Start]:::highlight --> B[End]:::muted`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph TD
  A[Start] --> B[End]`)
  })

  it('handles mixed color injection vectors', () => {
    const input = `graph LR
  classDef blue fill:#e1f5fe
  A[Node A]:::blue --> B[Node B]
  style A fill:#e1f5fe,stroke:#333
  class B blue`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(`graph LR
  A[Node A] --> B[Node B]`)
  })

  it('preserves non-color directives', () => {
    const input = `graph TD
  A[Start] --> B[Decision]
  B -->|Yes| C[End]
  B -->|No| D[Loop]
  D --> A`
    const result = sanitizeMermaidChart(input)
    expect(result).toBe(input)
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
