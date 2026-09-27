import { StaffDevPage } from './pages/StaffDevPage';
import { PlayerApp } from './player/PlayerApp';

// The player app, plus the staff test page from Phase 3 until the admin panel (Phase 6).
export function App() {
  return window.location.pathname.startsWith('/dev/staff') ? <StaffDevPage /> : <PlayerApp />;
}
