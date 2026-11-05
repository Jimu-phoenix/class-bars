import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import FaceTest from './pages/FaceTest'
import FaceVerify from './pages/FaceVerify'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import LecturerDashboard from './pages/LecturerDashboard'
import LecturerCourses from './pages/LecturerCourses'
import LecturerSessions from './pages/LecturerSessions'
import LecturerStudents from './pages/LecturerStudents'
import LecturerStudentDetail from './pages/LecturerStudentDetail'
import LecturerProfile from './pages/LecturerProfile'
import NewSession from './pages/NewSession'
import SessionLive from './pages/SessionLive'
import StudentHome from './pages/StudentHome'
import StudentCourses from './pages/StudentCourses'
import StudentHistory from './pages/StudentHistory'
import StudentProfile from './pages/StudentProfile'
import VerifyPdf from './pages/VerifyPdf'
import NotFound from './pages/NotFound'
import PrivacyPolicy from './pages/PrivacyPolicy'
import SandboxLanding from './pages/SandboxLanding'
import AdminDashboard from './pages/AdminDashboard'
import AdminLogin from './pages/AdminLogin'
import AdminRoute from './components/AdminRoute'
import SandboxStudent from './pages/SandboxStudent'
import SandboxLecturer from './pages/SandboxLecturer'
import ProtectedRoute from './components/ProtectedRoute'
import GuestRoute from './components/GuestRoute'
import RoleRoute from './components/RoleRoute'
import PwaUpdatePrompt from './components/PwaUpdatePrompt'
import OfflineBanner from './components/OfflineBanner'
import InstallPrompt from './components/InstallPrompt'

function App() {
  return (
    <BrowserRouter>
      <PwaUpdatePrompt />
      <OfflineBanner />
      <InstallPrompt />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestRoute>
              <Signup />
            </GuestRoute>
          }
        />
        <Route
          path="/admin/login"
          element={
            <GuestRoute>
              <AdminLogin />
            </GuestRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route path="/admin/venues" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/logs" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/verify/:code" element={<VerifyPdf />} />
        <Route path="/sandbox" element={<SandboxLanding />} />
        <Route path="/sandbox/lecturer" element={<SandboxLecturer />} />
        <Route path="/sandbox/student" element={<SandboxStudent />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student"
          element={
            <RoleRoute role="student">
              <StudentHome />
            </RoleRoute>
          }
        />
        <Route
          path="/student/courses"
          element={
            <RoleRoute role="student">
              <StudentCourses />
            </RoleRoute>
          }
        />
        <Route
          path="/student/profile"
          element={
            <RoleRoute role="student">
              <StudentProfile />
            </RoleRoute>
          }
        />
        <Route
          path="/student/history"
          element={
            <RoleRoute role="student">
              <StudentHistory />
            </RoleRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RoleRoute role="lecturer">
              <LecturerDashboard />
            </RoleRoute>
          }
        />
            <Route
              path="/dashboard/courses"
              element={
                <RoleRoute role="lecturer">
                  <LecturerCourses />
                </RoleRoute>
              }
            />
            <Route
              path="/dashboard/students"
              element={
                <RoleRoute role="lecturer">
                  <LecturerStudents />
                </RoleRoute>
              }
            />
            <Route
              path="/dashboard/students/:id"
              element={
                <RoleRoute role="lecturer">
                  <LecturerStudentDetail />
                </RoleRoute>
              }
            />
            <Route
              path="/dashboard/profile"
          element={
            <RoleRoute role="lecturer">
              <LecturerProfile />
            </RoleRoute>
          }
        />
        <Route
          path="/dashboard/sessions/new"
          element={
            <RoleRoute role="lecturer">
              <NewSession />
            </RoleRoute>
          }
        />
        <Route
          path="/dashboard/sessions"
          element={
            <RoleRoute role="lecturer">
              <LecturerSessions />
            </RoleRoute>
          }
        />
        <Route
          path="/dashboard/sessions/:id"
          element={
            <RoleRoute role="lecturer">
              <SessionLive />
            </RoleRoute>
          }
        />
        <Route
          path="/face-test"
          element={
            <AdminRoute>
              <FaceTest />
            </AdminRoute>
          }
        />
        <Route
          path="/face-verify"
          element={
            <AdminRoute>
              <FaceVerify />
            </AdminRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
