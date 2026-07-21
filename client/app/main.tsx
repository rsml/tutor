import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from '@client/store'
import { ThemeProvider } from '@client/features/settings/components/ThemeProvider'
import { initApiBase } from '@client/api/http'
import { Toaster } from 'sonner'
import App from '@client/app/App'
import '@client/index.css'

initApiBase().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemeProvider>
            <App />
            <Toaster position="bottom-right" theme="dark" richColors closeButton />
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </StrictMode>,
  )
})
