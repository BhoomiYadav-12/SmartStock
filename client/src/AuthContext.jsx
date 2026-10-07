import { useEffect, useState } from "react";
import api from "./api";
import AuthContext from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (!localStorage.getItem("smartstock-token")) return null;
    try {
      return JSON.parse(localStorage.getItem("smartstock-user"));
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem("smartstock-token")));

  useEffect(() => {
    const token = localStorage.getItem("smartstock-token");
    if (!token) {
      return;
    }

    api.get("/auth/me")
      .then((response) => {
        setUser(response.data.user);
        localStorage.setItem("smartstock-user", JSON.stringify(response.data.user));
      })
      .catch(() => {
        localStorage.removeItem("smartstock-token");
        localStorage.removeItem("smartstock-user");
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = ({ token, user: signedInUser }) => {
    localStorage.setItem("smartstock-token", token);
    localStorage.setItem("smartstock-user", JSON.stringify(signedInUser));
    setUser(signedInUser);
  };

  const logout = () => {
    localStorage.removeItem("smartstock-token");
    localStorage.removeItem("smartstock-user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
