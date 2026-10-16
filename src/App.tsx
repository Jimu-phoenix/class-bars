import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import FaceTest from './pages/FaceTest'
import FaceVerify from './pages/FaceVerify'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import LecturerDashboard from './pages/LecturerDashboard'
import LecturerCourses from './pages/LecturerCourses'
import LecturerRoster from './pages/LecturerRoster'
import LecturerProfile from './pages/LecturerProfile'
import NewSession from './pages/NewSession'
import SessionLive from './pages/SessionLive'
import StudentHome from './pages/StudentHome'
import StudentCourses from './pages/StudentCourses'
import StudentProfile from './pages/StudentProfile'
import NotFound from './pages/NotFound'
import PrivacyPolicy from './pages/PrivacyPolicy'
import SandboxLanding from './pages/SandboxLanding'
import SandboxLecturer from './pages/SandboxLecturer'
import SandboxStudent from './pages/SandboxStudent'
import ProtectedRoute from './components/ProtectedRoute'
import LecturerRoute from './components/LecturerRoute'
import StudentRoute from './components/StudentRoute'
import GuestRoute from './components/GuestRoute'

function App() {
  return (
    <BrowserRouter>
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
        <Route path="/privacy" element={<PrivacyPolicy />} />
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
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student"
          element={
            <StudentRoute>
              <StudentHome />
            </StudentRoute>
          }
        />
        <Route
          path="/student/courses"
          element={
            <StudentRoute>
              <StudentCourses />
            </StudentRoute>
          }
        />
        <Route
          path="/student/profile"
          element={
            <StudentRoute>
              <StudentProfile />
            </StudentRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <LecturerRoute>
              <LecturerDashboard />
            </LecturerRoute>
          }
        />
        <Route
          path="/dashboard/courses"
          element={
            <LecturerRoute>
              <LecturerCourses />
            </LecturerRoute>
          }
        />
        <Route
          path="/dashboard/roster"
          element={
            <LecturerRoute>
              <LecturerRoster />
            </LecturerRoute>
          }
        />
        <Route
          path="/dashboard/profile"
          element={
            <LecturerRoute>
              <LecturerProfile />
            </LecturerRoute>
          }
        />
        <Route
          path="/dashboard/sessions/new"
          element={
            <LecturerRoute>
              <NewSession />
            </LecturerRoute>
          }
        />
        <Route
          path="/dashboard/sessions/:id"
          element={
            <LecturerRoute>
              <SessionLive />
            </LecturerRoute>
          }
        />
        <Route
          path="/face-test"
          element={
            <ProtectedRoute>
              <FaceTest />
            </ProtectedRoute>
          }
        />
        <Route
          path="/face-verify"
          element={
            <ProtectedRoute>
              <FaceVerify />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
