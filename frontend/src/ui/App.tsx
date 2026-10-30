import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireRole } from "./state/auth.js";
import { ToastProvider } from "./state/toast.js";
import { ElderLayout, FamilyLayout } from "./layouts/AppLayouts.js";
import { RoleSelectPage } from "./pages/RoleSelectPage.js";
import { FamilyLoginPage } from "./pages/FamilyLoginPage.js";
import { ElderJoinPage } from "./pages/ElderJoinPage.js";
import { AddElderPage } from "./pages/AddElderPage.js";
import { FamilyInvitePage } from "./pages/FamilyInvitePage.js";
import { KioskPage } from "./pages/KioskPage.js";
import { ElderHomePage } from "./pages/ElderHomePage.js";
import { DietPage } from "./pages/DietPage.js";
import { HelpHomePage } from "./pages/HelpHomePage.js";
import { AgentChatPage } from "./pages/AgentChatPage.js";
import { SafetyHomePage } from "./pages/SafetyHomePage.js";
import { ScamCheckPage } from "./pages/ScamCheckPage.js";
import { RoleplayPage } from "./pages/RoleplayPage.js";
import { MemoryListPage } from "./pages/MemoryListPage.js";
import { MemoryInterviewPage } from "./pages/MemoryInterviewPage.js";
import { StoryChapterPage } from "./pages/StoryChapterPage.js";
import { MedicationsPage } from "./pages/MedicationsPage.js";
import { FamilyDashboardPage } from "./pages/FamilyDashboardPage.js";
import { HealthProfilePage } from "./pages/HealthProfilePage.js";
import { AgentTracePage } from "./pages/AgentTracePage.js";
import { A11yProvider } from "./state/a11y.js";
import { A11yDock } from "./components/A11yDock.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { RealtimeProvider } from "./state/realtime.js";

function GlobalDock() {
  return <A11yDock />;
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <A11yProvider>
        <AuthProvider>
          <ToastProvider>
            <RealtimeProvider>
              <Routes>
                <Route path="/" element={<RoleSelectPage />} />
                <Route path="/login/family" element={<FamilyLoginPage />} />
                <Route path="/login/elder" element={<ElderJoinPage />} />

                <Route
                  path="/elder"
                  element={
                    <RequireRole role="elder">
                      <ElderLayout />
                    </RequireRole>
                  }
                >
                  <Route index element={<KioskPage />} />
                  <Route path="today" element={<ElderHomePage />} />
                  <Route path="chat" element={<AgentChatPage />} />
                  <Route path="diet" element={<DietPage />} />
                  <Route path="story" element={<MemoryListPage />} />
                  <Route path="story/new" element={<MemoryInterviewPage />} />
                  <Route path="story/:id" element={<StoryChapterPage />} />
                  <Route path="meds" element={<MedicationsPage />} />
                  <Route path="safety" element={<SafetyHomePage />} />
                  <Route path="safety/scam" element={<ScamCheckPage />} />
                  <Route path="safety/help" element={<HelpHomePage />} />
                  <Route path="safety/roleplay" element={<RoleplayPage />} />
                  <Route path="trace/:id" element={<AgentTracePage />} />
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
                  <Route path="profile" element={<HealthProfilePage />} />
                  <Route path="elders/new" element={<AddElderPage />} />
                  <Route path="invite" element={<FamilyInvitePage />} />
                  <Route path="trace/:id" element={<AgentTracePage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <GlobalDock />
            </RealtimeProvider>
          </ToastProvider>
        </AuthProvider>
      </A11yProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
