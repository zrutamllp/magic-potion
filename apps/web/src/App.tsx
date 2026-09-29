import { PlayerApp } from './player/PlayerApp';
import { StaffApp } from './staff/StaffApp';

// The player app at /, and the staff panel, live dashboard and projector at /staff.
export function App() {
  const path = window.location.pathname;
  if (path.startsWith('/staff')) return <StaffApp />;
  return <PlayerApp />;
}
