import { describeJobJournalContract } from './job-journal.contract.js'
import { createFakeJobJournal } from './job-journal.fake.js'

describeJobJournalContract('fake', () => createFakeJobJournal())
