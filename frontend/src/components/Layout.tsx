import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  const isMusicCommittee = user?.role === 'music_committee' || isAdmin;

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-content">
          <Link to="/" className="navbar-brand">
            🎵 Harmonie Muziek
          </Link>

          <ul className="navbar-nav">
            <li>
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/my-music" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Mijn Muziek
              </NavLink>
            </li>
            {isMusicCommittee && (
              <>
                <li>
                  <NavLink to="/lists" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Lijsten
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/music-pieces" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Muziekstukken
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/titles" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Titels
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/upload" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Uploaden
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/instruments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Instrumenten
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/genres" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Genres
                  </NavLink>
                </li>
              </>
            )}
            {isAdmin && (
              <>
                <li>
                  <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Leden
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/orchestras" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    Orkesten
                  </NavLink>
                </li>
              </>
            )}
          </ul>

          <div className="navbar-user">
            <div className="user-info">
              <div className="user-name">{user?.firstName} {user?.lastName}</div>
              <div className="user-role">
                {user?.role === 'admin' && 'Beheerder'}
                {user?.role === 'music_committee' && 'Muziekcommissie'}
                {user?.role === 'member' && 'Lid'}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Uitloggen
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
