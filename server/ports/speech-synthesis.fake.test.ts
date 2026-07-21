import { describeSpeechSynthesisContract } from './speech-synthesis.contract.js'
import { createFakeSpeechSynthesis } from './speech-synthesis.fake.js'

describeSpeechSynthesisContract('fake', () => createFakeSpeechSynthesis())
