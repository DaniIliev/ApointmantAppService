import axios from "axios";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://localhost:8080";

const authHeaders = (token) => ({ headers: { "x-auth-token": token } });

export const getDashboard = async (token) => {
  const { data } = await axios.get(
    `${API_BASE}/api/dashboard`,
    authHeaders(token)
  );
  return data;
};

export const addDashboardItem = async (item, token) => {
  const { data } = await axios.post(
    `${API_BASE}/api/dashboard/items`,
    item,
    authHeaders(token)
  );
  return data;
};

export const updateDashboardItem = async (itemId, item, token) => {
  const { data } = await axios.put(
    `${API_BASE}/api/dashboard/items/${itemId}`,
    item,
    authHeaders(token)
  );
  return data;
};

export const removeDashboardItem = async (itemId, token) => {
  const { data } = await axios.delete(
    `${API_BASE}/api/dashboard/items/${itemId}`,
    authHeaders(token)
  );
  return data;
};

export const saveDashboardLayout = async (device, layout, token) => {
  const { data } = await axios.put(
    `${API_BASE}/api/dashboard/layout`,
    { device, layout },
    authHeaders(token)
  );
  return data;
};

export const fetchAnalytics = async (params, token) => {
  const search = new URLSearchParams(params).toString();
  const { data } = await axios.get(
    `${API_BASE}/api/analytics?${search}`,
    authHeaders(token)
  );
  return data;
};
