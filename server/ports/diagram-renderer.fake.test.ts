import { describeDiagramRendererContract } from './diagram-renderer.contract.js'
import { createFakeDiagramRenderer } from './diagram-renderer.fake.js'

describeDiagramRendererContract('fake', () => createFakeDiagramRenderer())
