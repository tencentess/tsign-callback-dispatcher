import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import CallbackManagementPage from './pages/CallbackManagementPage';
import TagManagementPage from './pages/TagManagementPage';
import DispatchHistoryPage from './pages/DispatchHistoryPage';
import SettingsPage from './pages/SettingsPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CallbackManagementPage />} />
        <Route path="callbacks" element={<CallbackManagementPage />} />
        <Route path="tags" element={<TagManagementPage />} />
        <Route path="dispatch-history" element={<DispatchHistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
};

export default App;
