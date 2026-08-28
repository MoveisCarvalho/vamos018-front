import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TwoFactorSetup } from './pages/TwoFactorSetup';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { DriverMap } from './pages/DriverMap';
import { PassengerMap } from './pages/PassengerMap';

const AppRoutes: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) return <div>Carregando...</div>;

    if (!user) {
        return <Login />;
    }

    return (
        <Routes>
            <Route path="/" element={<Navigate to={user.role === 'passenger' ? '/passenger' : '/driver'} />} />
            <Route path="/passenger" element={<PassengerMap />} />
            <Route path="/driver" element={<DriverMap />} />
            <Route path="/2fa-setup" element={<TwoFactorSetup />} />
        </Routes>
    );
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;