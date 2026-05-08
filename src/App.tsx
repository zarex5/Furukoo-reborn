import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage   from './pages/LoginPage';
import LobbyPage   from './pages/LobbyPage';
import GamePage    from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';
import AdminPage   from './pages/AdminPage';

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login"             element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/"                  element={user ? <LobbyPage />   : <Navigate to="/login" replace />} />
      <Route path="/game/:gameId"      element={user ? <GamePage />    : <Navigate to="/login" replace />} />
      <Route path="/profile/:username" element={user ? <ProfilePage /> : <Navigate to="/login" replace />} />
      <Route path="/admin"             element={user?.isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
