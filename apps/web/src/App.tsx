import { StaffDevPage } from './pages/StaffDevPage';
import { TeamPage } from './pages/TeamPage';

// Two pages for now, chosen by the address. A router arrives with the real screens (Phase 4).
export function App() {
  return window.location.pathname.startsWith('/dev/staff') ? <StaffDevPage /> : <TeamPage />;
}
