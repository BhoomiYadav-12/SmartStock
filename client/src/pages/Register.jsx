import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "../api";
import useAuth from "../useAuth";

export default function Register() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    if (formData.password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { name, email, password } = formData;
      const response = await api.post("/auth/register", { name, email, password });
      login(response.data);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to register. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-logo" to="/register">Stock<span>Sutra</span></Link>
        <p className="auth-tagline">From Stock Tracking to Smart Decisions</p>
        <p className="section-label">GET STARTED</p>
        <h1>Create your account</h1>
        <p className="auth-intro">Set up your workspace and keep stock on track.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              autoComplete="name"
              required
            />
          </label>
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
              autoComplete="new-password"
              minLength="6"
              required
            />
          </label>
          <label className="auth-field">
            <span>Confirm Password</span>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength="6"
              required
            />
          </label>
          {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="auth-switch">Already have an account? <Link to="/login">Login</Link></p>
      </section>
    </main>
  );
}
