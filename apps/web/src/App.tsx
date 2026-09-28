import { StaffDevPage } from './pages/StaffDevPage';
import { PlayerApp } from './player/PlayerApp';
import { StaffApp } from './staff/StaffApp';

// The player app at /, the staff admin panel at /staff, and the Phase 3 staff test page at
// /dev/staff until the facilitator dashboard (Phase 6C) replaces its live controls.
export function App() {
  const path = window.location.pathname;
  if (path.startsWith('/dev/staff')) return <StaffDevPage />;
  if (path.startsWith('/staff')) return <StaffApp />;
  return <PlayerApp />;
}
