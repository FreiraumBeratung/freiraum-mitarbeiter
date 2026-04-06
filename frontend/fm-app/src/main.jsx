import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/glass.css'
import './styles/animations.css'
import './styles/freiraum-enterprise.css'
import './styles/freiraum.css'

console.log("MAIN LOADED");

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
