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
import NewSession from './pages/NewSession'
import SandboxLanding from './pages/SandboxLanding'
import SandboxLecturer from './pages/SandboxLecturer'
import SandboxStudent from './pages/SandboxStudent'
import ProtectedRoute from './components/ProtectedRoute'
import LecturerRoute from './components/LecturerRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
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
          path="/dashboard/sessions/new"
          element={
            <LecturerRoute>
              <NewSession />
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
      </Routes>
    </BrowserRouter>
  )
}

export default App
