import { StaffDevPage } from './pages/StaffDevPage';
import { PlayerApp } from './player/PlayerApp';
import { StaffApp } from './staff/StaffApp';

// The player app at /, the staff panel and live dashboard at /staff, and the Phase 3 staff test
// page at /dev/staff (only while the server has dev tools on; removed after Phase 6D).
export function App() {
  const path = window.location.pathname;
  if (path.startsWith('/dev/staff')) return <StaffDevPage />;
  if (path.startsWith('/staff')) return <StaffApp />;
  return <PlayerApp />;
}
