import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AppHeader from './components/AppHeader.jsx'
import SceneCanvas from './ui/SceneCanvas.jsx'
import PageTransition from './ui/PageTransition.jsx'
import { useHighContrast } from './hooks/useHighContrast.js'
import HomePage from './pages/HomePage.jsx'
import CoreRecognitionPage from './pages/CoreRecognitionPage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'

function Layout() {
  const [highContrast, toggleContrast] = useHighContrast()
  return (
    <>
      {/* голографический фон: CSS-переливы + three.js-фигуры поверх */}
      <div className="holo-bg" aria-hidden="true">
        <div className="holo-bg__drift">
          <div className="holo-bg__blobs" />
        </div>
        <div className="holo-bg__foil" />
      </div>
      <SceneCanvas />
      <div className="app-shell">
        <AppHeader highContrast={highContrast} onToggleContrast={toggleContrast} />
        <main className="app-main" id="main">
          <div className="container">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
        <footer className="app-footer">
          <div className="container">
            <p>QOLIM AI · Қазақ жестілі тілінің аудармашысы · Бейне серверге жіберілмейді, тек браузерде өңделеді.</p>
          </div>
        </footer>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="/core" element={<CoreRecognitionPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
