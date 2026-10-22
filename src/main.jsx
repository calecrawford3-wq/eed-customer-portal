import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppCrashBoundary from '@/components/AppCrashBoundary'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppCrashBoundary><App /></AppCrashBoundary>
)
