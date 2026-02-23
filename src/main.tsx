import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import CustomerChat from './pages/CustomerChat'
import AdminPanel from './pages/AdminPanel'
import VoiceAgent from './pages/VoiceAgent'
import VoiceCustomer from './pages/VoiceCustomer'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/customer" element={<CustomerChat />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/voice" element={<VoiceAgent />} />
                <Route path="/voice/customer" element={<VoiceCustomer />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
)

