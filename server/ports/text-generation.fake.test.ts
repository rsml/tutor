import { describeTextGenerationContract } from './text-generation.contract.js'
import { createFakeTextGeneration } from './text-generation.fake.js'

describeTextGenerationContract('fake', () => createFakeTextGeneration())
