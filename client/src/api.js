import axios from "axios";

export const API_BASE_URL = "https://smartstock-server.onrender.com/api";
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("smartstock-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```