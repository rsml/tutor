import { describeKeyVaultContract } from './key-vault.contract.js'
import { createFakeKeyVault } from './key-vault.fake.js'

describeKeyVaultContract('fake', () => createFakeKeyVault())
