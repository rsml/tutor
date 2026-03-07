import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from './store'
import { ThemeProvider } from './components/ThemeProvider'
import { initApiBase } from './lib/api-base'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

initApiBase().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemeProvider>
            <App />
            <Toaster position="bottom-right" theme="dark" richColors />
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </StrictMode>,
  )
})
