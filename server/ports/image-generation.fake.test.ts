import { describeImageGenerationContract } from './image-generation.contract.js'
import { createFakeImageGeneration } from './image-generation.fake.js'

describeImageGenerationContract('fake', () => createFakeImageGeneration())
