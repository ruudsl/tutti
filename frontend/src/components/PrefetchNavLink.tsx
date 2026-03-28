import { NavLink, type NavLinkProps } from 'react-router-dom';
import { prefetchRoute } from '../hooks/usePrefetch';

interface PrefetchNavLinkProps extends NavLinkProps {
  to: string;
}

/**
 * NavLink that prefetches the route chunk on hover/focus
 * This eliminates the loading spinner when navigating
 */
export function PrefetchNavLink({ to, children, ...props }: PrefetchNavLinkProps) {
  return (
    <NavLink
      to={to}
      onMouseEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      {...props}
    >
      {children}
    </NavLink>
  );
}
