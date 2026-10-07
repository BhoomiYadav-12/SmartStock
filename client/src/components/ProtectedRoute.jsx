import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuth from "../useAuth";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="auth-loading">Checking your session...</div>;
  }

  return user
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location }} />;
}
