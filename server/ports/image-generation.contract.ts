import { describe, expect, it } from 'vitest'
import type { FakeImageGeneration } from './image-generation.fake.js'

/**
 * The ImageGeneration contract. Fake-only: a real subject would spend money
 * against a live provider, so no adapter is ever wired into this contract.
 *
 * `makeSubject` is typed to the fake's own shape rather than the bare
 * `ImageGeneration` port, because pinning the fallback path needs
 * `failNextAttempt`, which only the fake exposes, and because this port
 * never gets a real adapter there is no future subject that would need the
 * narrower type.
 */
export function describeImageGenerationContract(
  label: string,
  makeSubject: () => FakeImageGeneration | Promise<FakeImageGeneration>,
): void {
  describe(`ImageGeneration contract (${label})`, () => {
    it('returns an image for a valid request, produced by the preferred model', async () => {
      const imageGen = await makeSubject()

      const image = await imageGen.generate({
        provider: 'openai',
        preferredModel: 'gpt-image-1',
        prompt: 'a minimal abstract book cover',
        signal: new AbortController().signal,
      })

      expect(image.data).toBeInstanceOf(Buffer)
      expect(image.data.length).toBeGreaterThan(0)
      expect(image.mediaType).toMatch(/^image\//)
      expect(image._diag.modelUsed).toBe('gpt-image-1')
      expect(image._diag.fellBack).toBe(false)
    })

    it('records the request', async () => {
      const imageGen = await makeSubject()

      await imageGen.generate({
        provider: 'google',
        preferredModel: 'imagen-test',
        prompt: 'a mountain at dawn',
        signal: new AbortController().signal,
      })

      expect(imageGen.requests).toHaveLength(1)
      expect(imageGen.requests[0].prompt).toBe('a mountain at dawn')
    })

    it('falls back to another model in the chain when the preferred model fails recoverably, and reports fellBack', async () => {
      const imageGen = await makeSubject()
      imageGen.failNextAttempt('openai', 'gpt-image-1')

      const image = await imageGen.generate({
        provider: 'openai',
        preferredModel: 'gpt-image-1',
        prompt: 'cover art',
        signal: new AbortController().signal,
      })

      expect(image._diag.fellBack).toBe(true)
      expect(image._diag.modelUsed).not.toBe('gpt-image-1')
    })

    it('does not retry a fallback model on an auth failure, it rejects immediately', async () => {
      const imageGen = await makeSubject()
      imageGen.failNextAttempt('openai', 'gpt-image-1', 'auth')

      await expect(imageGen.generate({
        provider: 'openai',
        preferredModel: 'gpt-image-1',
        prompt: 'cover art',
        signal: new AbortController().signal,
      })).rejects.toThrow()
    })

    it('does not retry a fallback model on a content-policy failure, it rejects immediately', async () => {
      const imageGen = await makeSubject()
      imageGen.failNextAttempt('openai', 'gpt-image-1', 'content-policy')

      await expect(imageGen.generate({
        provider: 'openai',
        preferredModel: 'gpt-image-1',
        prompt: 'cover art',
        signal: new AbortController().signal,
      })).rejects.toThrow()
    })

    it('rejects when every model in the chain fails', async () => {
      const imageGen = await makeSubject()
      // anthropic has no configured fallback chain, so failing the
      // preferred model exhausts the whole chain in one step.
      imageGen.failNextAttempt('anthropic', 'preferred-model')

      await expect(imageGen.generate({
        provider: 'anthropic',
        preferredModel: 'preferred-model',
        prompt: 'cover art',
        signal: new AbortController().signal,
      })).rejects.toThrow()
    })

    it('rejects when the signal is already aborted', async () => {
      const imageGen = await makeSubject()
      const controller = new AbortController()
      controller.abort()

      await expect(imageGen.generate({
        provider: 'openai',
        preferredModel: 'gpt-image-1',
        prompt: 'cover art',
        signal: controller.signal,
      })).rejects.toThrow()
    })
  })
}
