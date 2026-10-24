import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireRole } from "./state/auth.js";
import { ToastProvider } from "./state/toast.js";
import { ElderLayout, FamilyLayout } from "./layouts/AppLayouts.js";
import { RoleSelectPage } from "./pages/RoleSelectPage.js";
import { ElderHomePage } from "./pages/ElderHomePage.js";
import { AgentChatPage } from "./pages/AgentChatPage.js";
import { SafetyHomePage } from "./pages/SafetyHomePage.js";
import { ScamCheckPage } from "./pages/ScamCheckPage.js";
import { MemoryListPage } from "./pages/MemoryListPage.js";
import { MemoryInterviewPage } from "./pages/MemoryInterviewPage.js";
import { StoryChapterPage } from "./pages/StoryChapterPage.js";
import { FamilyDashboardPage } from "./pages/FamilyDashboardPage.js";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<RoleSelectPage />} />

            <Route
              path="/elder"
              element={
                <RequireRole role="elder">
                  <ElderLayout />
                </RequireRole>
              }
            >
              <Route index element={<ElderHomePage />} />
              <Route path="chat" element={<AgentChatPage />} />
              <Route path="story" element={<MemoryListPage />} />
              <Route path="story/new" element={<MemoryInterviewPage />} />
              <Route path="story/:id" element={<StoryChapterPage />} />
              <Route path="safety" element={<SafetyHomePage />} />
              <Route path="safety/scam" element={<ScamCheckPage />} />
            </Route>

            <Route
              path="/family"
              element={
                <RequireRole role="family">
                  <FamilyLayout />
                </RequireRole>
              }
            >
              <Route index element={<FamilyDashboardPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
