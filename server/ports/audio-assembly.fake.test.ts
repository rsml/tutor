import { describeAudioAssemblyContract } from './audio-assembly.contract.js'
import { createFakeAudioAssembly } from './audio-assembly.fake.js'

describeAudioAssemblyContract('fake', () => createFakeAudioAssembly())
