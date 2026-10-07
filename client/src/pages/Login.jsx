import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import useAuth from "../useAuth";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const response = await api.post("/auth/login", formData);
      login(response.data);
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page login-page">
      <section className="login-form-panel">
        <section className="auth-card login-card">
          <Link className="auth-logo" to="/login">Stock<span>Sutra</span></Link>
          <p className="auth-tagline">From Stock Tracking to Smart Decisions</p>
          <p className="section-label">WELCOME BACK</p>
          <h1>Sign in to your account</h1>
          <p className="auth-intro">Manage your inventory with confidence.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
            </label>
            {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="auth-switch">Don't have an account? <Link to="/register">Register</Link></p>
        </section>
      </section>
      <aside className="login-visual" aria-label="StockSutra warehouse inventory">
        <img className="login-photo" src="/stocksutralogin.jpg" alt="Warehouse worker checking inventory on a tablet" />
        <div className="login-photo-overlay" />
        <div className="login-visual-copy">
          <span>INVENTORY, IN FOCUS</span>
          <h2>Every item accounted for.<br />Every decision clearer.</h2>
          <p>Keep stock, movement, and operations connected in one place.</p>
        </div>
      </aside>
    </main>
  );
}
