import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

import './theme/tokens.css'
import './styles/app.css'

// Bundled fonts (offline). Crimson Pro carries polytonic Greek for glosses like (δικαιοσύνη).
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/600.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
