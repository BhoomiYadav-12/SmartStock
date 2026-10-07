import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import api, { API_ORIGIN } from "./api";
import useAuth from "./useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import "./App.css";

const iconPaths = {
  grid: "M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z",
  boxes: "M4 7 12 3l8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10M8 5l8 4",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  sparkle: "m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z",
  chart: "M4 19V5m0 14h17M7 15l4-4 3 2 6-7",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  truck: "M3 6h11v11H3zM14 10h4l3 3v4h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6",
  search: "m20 20-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 18 6-6-6-6",
  down: "m7 10 5 5 5-5",
  refresh: "M20 7v5h-5M4 17v-5h5m-3.2-3A7 7 0 0 1 18.4 7L20 12M4 12l1.6 5A7 7 0 0 0 18.2 15",
  close: "M18 6 6 18M6 6l12 12",
  logout: "M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
  package: "M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7V8Zm-18 0 9 5 9-5m-9 5v10M7.5 5.5l9 5",
  rupee: "M5 5h14M5 9h14M7 5c5 0 7 2 7 5s-2 5-7 5l8 6",
  warning: "M12 9v4m0 4h.01M10.3 4.8 2.9 18a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8",
  user: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name] || iconPaths.grid} />
    </svg>
  );
}

function Skeleton({ className = "" }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

const ITEMS_PER_PAGE = 10;
const navItems = [
  { label: "Dashboard", icon: "grid", path: "/dashboard" },
  { label: "Inventory", icon: "boxes", path: "/inventory" },
  { label: "AI Insights", icon: "sparkle", path: "/ai-insights" },
  { label: "Assistant", icon: "sparkle", path: "/assistant" },
  { label: "Dead Stock", icon: "boxes", path: "/dead-stock" },
  { label: "Simulator", icon: "activity", path: "/simulator" },
  { label: "Assigned Inventory", icon: "boxes", path: "/assigned-inventory" },
  { label: "Transactions", icon: "activity", path: "/transactions" },
  { label: "Team", icon: "team", path: "/team" }
];

const pageCopy = {
  "/dashboard": { title: "Dashboard", subtitle: "Your inventory at a glance." },
  "/inventory": { title: "Inventory", subtitle: "Manage your products and stock." },
  "/ai-insights": { title: "AI Insights", subtitle: "Understand demand, risk and recommended actions." },
  "/assistant": { title: "Inventory Assistant", subtitle: "Ask questions and get answers from your actual inventory data." },
  "/dead-stock": { title: "Dead Stock", subtitle: "Find inactive, slow-moving and excess inventory using recorded stock movements." },
  "/simulator": { title: "What-if Simulator", subtitle: "Explore inventory decisions before applying them." },
  "/assigned-inventory": { title: "Assigned Inventory", subtitle: "Track inventory distributed across your team." },
  "/transactions": { title: "Transactions", subtitle: "View every inventory movement." },
  "/team": { title: "Team", subtitle: "Manage workspace members and responsibilities." }
};

function paginateItems(items, requestedPage) {
  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const page = Math.min(requestedPage, pageCount);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  return { page, pageCount, items: items.slice(startIndex, startIndex + ITEMS_PER_PAGE) };
}

function getPageNumbers(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", pageCount];
  if (page >= pageCount - 3) return [1, "…", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "…", page - 1, page, page + 1, "…", pageCount];
}

function Pagination({ page, pageCount, total, itemName, onPageChange, label }) {
  if (total === 0) return null;
  const firstItem = (page - 1) * ITEMS_PER_PAGE + 1;
  const lastItem = Math.min(page * ITEMS_PER_PAGE, total);

  return (
    <nav className="pagination-bar" aria-label={`${label} pagination`}>
      <span className="pagination-summary">Showing {firstItem.toLocaleString()}–{lastItem.toLocaleString()} of {total.toLocaleString()} {itemName}</span>
      <div className="pagination-controls">
        <button type="button" className="pagination-step" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Go to previous page">← Previous</button>
        <span className="pagination-mobile-page" aria-live="polite">Page {page} of {pageCount}</span>
        <div className="pagination-pages" role="group" aria-label={`${label} pages`}>
          {getPageNumbers(page, pageCount).map((pageNumber, index) => pageNumber === "…"
            ? <span className="pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
            : <button
              type="button"
              className={`pagination-page ${page === pageNumber ? "is-current" : ""}`}
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
              aria-label={`Go to page ${pageNumber}`}
              aria-current={page === pageNumber ? "page" : undefined}
            >{pageNumber}</button>)}
        </div>
        <button type="button" className="pagination-step" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} aria-label="Go to next page">Next →</button>
      </div>
    </nav>
  );
}

const formatDemand = (value) => (
  Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
);

const getForecastStatusClass = (status) => (
  status.toLowerCase().replaceAll(" ", "-")
);

const formatDecisionValue = (value, suffix = "") => (
  value === null || value === undefined ? "—" : `${formatDemand(value)}${suffix}`
);

function StockSutraLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageCopy[location.pathname];
  const isDashboardPage = location.pathname === "/dashboard";
  const isInventoryPage = location.pathname === "/inventory";
  const isInsightsPage = location.pathname === "/ai-insights";
  const isAssistantPage = location.pathname === "/assistant";
  const isDeadStockPage = location.pathname === "/dead-stock";
  const isSimulatorPage = location.pathname === "/simulator";
  const isAssignedPage = location.pathname === "/assigned-inventory";
  const isTransactionsPage = location.pathname === "/transactions";
  const isTeamPage = location.pathname === "/team";
  const { user, logout } = useAuth();
  const isAdmin = user.role === "admin";
  const canManageProducts = ["admin", "manager"].includes(user.role);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDistributionPage, setProductDistributionPage] = useState(1);
  const [productDetailsLoading, setProductDetailsLoading] = useState(false);
  const [productFormError, setProductFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [productPage, setProductPage] = useState(1);
  const [transactions, setTransactions] = useState([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamPage, setTeamPage] = useState(1);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "staff" });
  const [inviteFeedback, setInviteFeedback] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberInventoryPage, setMemberInventoryPage] = useState(1);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");
  const [forecasts, setForecasts] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState("");
  const [forecastPage, setForecastPage] = useState(1);
  const [anomalies, setAnomalies] = useState([]);
  const [anomalySummary, setAnomalySummary] = useState(null);
  const [insufficientAnomalyProducts, setInsufficientAnomalyProducts] = useState([]);
  const [anomalyLoading, setAnomalyLoading] = useState(true);
  const [anomalyError, setAnomalyError] = useState("");
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState("all");
  const [anomalyTypeFilter, setAnomalyTypeFilter] = useState("all");
  const [anomalyPage, setAnomalyPage] = useState(1);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantContextProduct, setAssistantContextProduct] = useState("");
  const [deadStockItems, setDeadStockItems] = useState([]);
  const [deadStockSummary, setDeadStockSummary] = useState(null);
  const [deadStockLoading, setDeadStockLoading] = useState(true);
  const [deadStockError, setDeadStockError] = useState("");
  const [deadStockFilter, setDeadStockFilter] = useState("all");
  const [deadStockPage, setDeadStockPage] = useState(1);
  const [selectedDeadStock, setSelectedDeadStock] = useState(null);
  const [inventoryDecisions, setInventoryDecisions] = useState([]);
  const [decisionPage, setDecisionPage] = useState(1);
  const [decisionSummary, setDecisionSummary] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [decisionError, setDecisionError] = useState("");
  const [simulationForm, setSimulationForm] = useState({
    productId: "",
    demandChangePercent: 0,
    leadTimeChangeDays: "0"
  });
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [stockAction, setStockAction] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: "", note: "" });
  const [stockError, setStockError] = useState("");
  const [savingStock, setSavingStock] = useState(false);
  const [transferAction, setTransferAction] = useState(null);
  const [transferForm, setTransferForm] = useState({ recipientUserId: "", quantity: "", note: "" });
  const [transferError, setTransferError] = useState("");
  const [transferFeedback, setTransferFeedback] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [openProductMenuId, setOpenProductMenuId] = useState(null);
  const [productMenuPosition, setProductMenuPosition] = useState({ top: 0, left: 0 });
  const productMenuRef = useRef(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    lowStockThreshold: 10,
    supplier: "",
    supplierLeadTimeDays: "",
    assignedTo: ""
  });

  const fetchProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    setProductPage(1);
    try {
      const response = await api.get("/products");
      setProducts(response.data.products);
    } catch (error) {
      setProductsError(error.response?.data?.message || "Unable to load inventory.");
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    setTransactionsError("");
    setTransactionPage(1);
    try {
      const response = await api.get("/transactions");
      setTransactions(response.data.transactions);
    } catch (error) {
      setTransactionsError(error.response?.data?.message || "Unable to load inventory history.");
    } finally {
      setTransactionsLoading(false);
    }
  };

  const fetchTeam = async () => {
    setTeamLoading(true);
    setTeamError("");
    setTeamPage(1);
    try {
      const response = await api.get("/team");
      setTeamMembers(response.data.members);
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to load workspace team.");
    } finally {
      setTeamLoading(false);
    }
  };

  const fetchForecast = async () => {
    setForecastLoading(true);
    setForecastError("");
    setForecastPage(1);
    try {
      const response = await api.get("/forecast");
      setForecasts(response.data.forecasts);
    } catch (error) {
      setForecastError(error.response?.data?.message || "Unable to load forecast.");
    } finally {
      setForecastLoading(false);
    }
  };

  const fetchInventoryDecisions = async () => {
    setDecisionLoading(true);
    setDecisionError("");
    setDecisionPage(1);
    try {
      const response = await api.get("/decision-engine");
      setInventoryDecisions(response.data.products || []);
      setDecisionSummary(response.data.summary || null);
    } catch (error) {
      setDecisionError(error.response?.data?.message || "Unable to load inventory intelligence.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const fetchAnomalies = async () => {
    setAnomalyLoading(true);
    setAnomalyError("");
    setAnomalyPage(1);
    try {
      const response = await api.get("/anomalies");
      setAnomalies(response.data.anomalies || []);
      setAnomalySummary(response.data.summary || null);
      setInsufficientAnomalyProducts(response.data.insufficientProducts || []);
    } catch (error) {
      setAnomalyError(error.response?.data?.message || "Unable to analyze inventory activity.");
    } finally {
      setAnomalyLoading(false);
    }
  };

  const fetchDeadStock = async () => {
    setDeadStockLoading(true);
    setDeadStockError("");
    setDeadStockPage(1);
    try {
      const response = await api.get("/dead-stock");
      setDeadStockItems(response.data.items || []);
      setDeadStockSummary(response.data.summary || null);
    } catch (error) {
      setDeadStockError(error.response?.data?.message || "Unable to analyze stock movement.");
    } finally {
      setDeadStockLoading(false);
    }
  };

  const askInventoryAssistant = async (questionText = assistantQuestion) => {
    const message = questionText.trim();
    if (!message || assistantLoading) return;
    setAssistantQuestion("");
    setAssistantMessages((current) => [...current, { role: "user", text: message }]);
    setAssistantLoading(true);
    try {
      const response = await api.post("/assistant", {
        message,
        contextProductName: assistantContextProduct || undefined
      });
      const result = response.data;
      if (result.contextProductName) setAssistantContextProduct(result.contextProductName);
      setAssistantMessages((current) => [...current, { role: "assistant", ...result }]);
    } catch (error) {
      setAssistantMessages((current) => [...current, {
        role: "assistant",
        error: true,
        answer: error.response?.data?.message || "I couldn't reach the inventory assistant. Check your connection and try again."
      }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  const clearAssistantConversation = () => {
    setAssistantMessages([]);
    setAssistantContextProduct("");
  };

  const updateSimulationForm = (updates) => {
    setSimulationForm((current) => ({ ...current, ...updates }));
    setSimulationResult(null);
    setSimulationError("");
  };

  const resetSimulationScenario = () => {
    setSimulationForm((current) => ({
      ...current,
      demandChangePercent: 0,
      leadTimeChangeDays: "0"
    }));
    setSimulationResult(null);
    setSimulationError("");
  };

  const runInventorySimulation = async (event) => {
    event.preventDefault();
    setSimulationLoading(true);
    setSimulationError("");
    try {
      const response = await api.post("/simulator", {
        productId: simulationForm.productId,
        demandChangePercent: Number(simulationForm.demandChangePercent),
        leadTimeChangeDays: Number(simulationForm.leadTimeChangeDays)
      });
      setSimulationResult(response.data);
    } catch (error) {
      setSimulationResult(null);
      setSimulationError(error.response?.data?.message || "Unable to run this inventory simulation.");
    } finally {
      setSimulationLoading(false);
    }
  };

  const resetProductForm = () => {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setFormData({
      name: "",
      category: "",
      quantity: "",
      price: "",
      lowStockThreshold: 10,
      supplier: "",
      supplierLeadTimeDays: "",
      assignedTo: ""
    });
    setEditingId(null);
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(false);
    setProductFormError("");
  };

  const openNewProductForm = () => {
    resetProductForm();
    setShowForm(true);
  };

  const closeProductForm = () => {
    setShowForm(false);
    resetProductForm();
  };

  const openStockAction = (product, type) => {
    setStockAction({ product, type });
    setStockForm({ quantity: "", note: "" });
    setStockError("");
    setIsMobileNavOpen(false);
  };

  const openTransferAction = (product, type = "TRANSFER", recipientUserId = "") => {
    const returnToDetails = Boolean(selectedProduct);
    setSelectedProduct(null);
    setTransferAction({ product, type, returnToDetails });
    setTransferForm({ recipientUserId, quantity: "", note: "" });
    setTransferError("");
    setTransferFeedback("");
  };

  const closeTransferAction = () => {
    setTransferAction(null);
    setTransferForm({ recipientUserId: "", quantity: "", note: "" });
    setTransferError("");
  };

  const handleTransferSubmit = async (event) => {
    event.preventDefault();
    const quantity = Number(transferForm.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setTransferError("Enter a whole number greater than zero.");
      return;
    }
    if (!transferForm.recipientUserId) {
      setTransferError("Choose a team member.");
      return;
    }

    setSavingTransfer(true);
    setTransferError("");
    try {
      const endpoint = transferAction.type === "RETURN" ? "return" : "transfer";
      const response = await api.post(`/transactions/${endpoint}`, {
        productId: transferAction.product._id,
        recipientUserId: transferForm.recipientUserId,
        quantity,
        note: transferForm.note
      });
      const returnToDetails = transferAction.returnToDetails;
      closeTransferAction();
      setTransferFeedback(response.data.message);
      await Promise.all([fetchProducts(), fetchTransactions(), fetchTeam(), fetchForecast(), fetchInventoryDecisions(), fetchAnomalies()]);
      if (returnToDetails) await openProductDetails(response.data.product);
    } catch (error) {
      setTransferError(error.response?.data?.message || "Unable to complete this stock movement. Please try again.");
    } finally {
      setSavingTransfer(false);
    }
  };

  const closeStockAction = () => {
    setStockAction(null);
    setStockForm({ quantity: "", note: "" });
    setStockError("");
  };

  const handleStockFormChange = (event) => {
    setStockForm({ ...stockForm, [event.target.name]: event.target.value });
  };

  const handleStockSubmit = async (event) => {
    event.preventDefault();
    const quantity = Number(stockForm.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockError("Enter a quantity greater than 0.");
      return;
    }

    setSavingStock(true);
    setStockError("");
    try {
      const endpoint = stockAction.type === "IN" ? "stock-in" : "stock-out";
      await api.post(`/transactions/${endpoint}`, {
        productId: stockAction.product._id,
        quantity,
        note: stockForm.note
      });
      closeStockAction();
      await Promise.all([fetchProducts(), fetchTransactions(), fetchForecast(), fetchInventoryDecisions(), fetchAnomalies()]);
    } catch (error) {
      setStockError(error.response?.data?.message || "Unable to update stock. Please try again.");
    } finally {
      setSavingStock(false);
    }
  };

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const handleRemoveImage = () => {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setProductFormError("");
    try {
      const productData = new window.FormData();
      Object.entries({
        ...formData,
        quantity: Number(formData.quantity),
        price: Number(formData.price),
        lowStockThreshold: Number(formData.lowStockThreshold),
        supplierLeadTimeDays: formData.supplierLeadTimeDays === "" ? "" : Number(formData.supplierLeadTimeDays)
      }).forEach(([key, value]) => productData.append(key, value));
      if (imageFile) productData.append("image", imageFile);
      if (removeImage) productData.append("imageAction", "remove");

      if (editingId) {
        await api.put(`/products/${editingId}`, productData);
      } else {
        await api.post("/products", productData);
      }

      closeProductForm();
      await Promise.all([fetchProducts(), fetchForecast(), fetchTeam(), fetchInventoryDecisions(), fetchAnomalies()]);
    } catch (error) {
      setProductFormError(error.response?.data?.message || "Unable to save product. Please try again.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product? Its inventory history will remain.")) return;
    try {
      await api.delete(`/products/${id}`);
      await Promise.all([fetchProducts(), fetchForecast(), fetchInventoryDecisions(), fetchAnomalies()]);
    } catch (error) {
      setProductsError(error.response?.data?.message || "Unable to delete product.");
    }
  };

  const handleEdit = (product) => {
    setEditingId(product._id);
    setProductFormError("");
    setFormData({
      name: product.name,
      category: product.category,
      quantity: product.quantity,
      price: product.price,
      lowStockThreshold: product.lowStockThreshold,
      supplier: product.supplier,
      supplierLeadTimeDays: product.supplierLeadTimeDays ?? "",
      assignedTo: product.assignedTo?._id || product.assignedTo || ""
    });
    setImageFile(null);
    setImagePreview(product.image ? `${API_ORIGIN}${product.image}` : "");
    setRemoveImage(false);
    setShowForm(true);
  };

  const openProductDetails = async (product) => {
    setProductDistributionPage(1);
    setSelectedProduct({ product, recentActivity: [], assignmentHistory: [] });
    setProductDetailsLoading(true);
    try {
      const response = await api.get(`/products/${product._id}`);
      setSelectedProduct({ product: response.data.product, recentActivity: response.data.recentActivity || [], assignmentHistory: response.data.assignmentHistory || [] });
    } catch (error) {
      setSelectedProduct({ product, recentActivity: [], assignmentHistory: [], error: error.response?.data?.message || "Unable to load product activity." });
    } finally {
      setProductDetailsLoading(false);
    }
  };

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    setTeamError("");
    setInviteFeedback(null);
    try {
      const response = await api.post("/team/members", inviteForm);
      setInviteFeedback({ message: response.data.message, temporaryPassword: response.data.temporaryPassword, email: response.data.member.email });
      setInviteForm({ name: "", email: "", role: "staff" });
      setShowInviteForm(false);
      await fetchTeam();
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to add team member.");
    }
  };

  const updateMemberRole = async (member, role) => {
    try {
      const response = await api.patch(`/team/members/${member._id}`, { role });
      setTeamMembers((current) => current.map((item) => item._id === member._id ? response.data.member : item));
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to update member role.");
    }
  };

  const deactivateMember = async (member) => {
    if (!window.confirm(`Deactivate ${member.name}? Their product assignments will be cleared.`)) return;
    try {
      const response = await api.delete(`/team/members/${member._id}`);
      setInviteFeedback({ message: response.data.message });
      await Promise.all([fetchTeam(), fetchProducts(), fetchInventoryDecisions(), fetchAnomalies()]);
    } catch (error) {
      setTeamError(error.response?.data?.message || "Unable to deactivate member.");
    }
  };

  const toggleProductMenu = (event, productId) => {
    if (openProductMenuId === productId) {
      setOpenProductMenuId(null);
      return;
    }

    const buttonBounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = Math.min(180, window.innerWidth - 16);
    const menuHeight = canManageProducts ? 200 : 90;
    const left = Math.max(8, Math.min(buttonBounds.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = buttonBounds.bottom + menuHeight + 8 <= window.innerHeight
      ? buttonBounds.bottom + 5
      : Math.max(8, buttonBounds.top - menuHeight - 5);

    setProductMenuPosition({ top, left });
    setOpenProductMenuId(productId);
  };

  const runProductMenuAction = (action) => {
    setOpenProductMenuId(null);
    action();
  };

  useEffect(() => {
    fetchProducts();
    fetchTransactions();
    fetchForecast();
    fetchInventoryDecisions();
    fetchAnomalies();
    fetchDeadStock();
    fetchTeam();
  }, []);

  useEffect(() => {
    if (!openProductMenuId) return undefined;

    const closeMenuOnOutsidePointer = (event) => {
      if (event.target.closest?.(".row-actions-toggle")) return;
      if (!productMenuRef.current?.contains(event.target)) setOpenProductMenuId(null);
    };
    const closeMenuOnEscape = (event) => {
      if (event.key === "Escape") setOpenProductMenuId(null);
    };
    const closeMenuOnViewportChange = () => setOpenProductMenuId(null);

    document.addEventListener("pointerdown", closeMenuOnOutsidePointer);
    document.addEventListener("keydown", closeMenuOnEscape);
    window.addEventListener("scroll", closeMenuOnViewportChange, true);
    window.addEventListener("resize", closeMenuOnViewportChange);

    return () => {
      document.removeEventListener("pointerdown", closeMenuOnOutsidePointer);
      document.removeEventListener("keydown", closeMenuOnEscape);
      window.removeEventListener("scroll", closeMenuOnViewportChange, true);
      window.removeEventListener("resize", closeMenuOnViewportChange);
    };
  }, [openProductMenuId]);

  const totalProducts = products.length;
  const totalInventoryUnits = products.reduce((total, product) => total + product.quantity, 0);
  const lowStockProducts = products.filter(
    (product) => product.quantity > 0 && product.quantity <= product.lowStockThreshold
  ).length;
  const outOfStockProducts = products.filter((product) => product.quantity === 0).length;
  const inventoryValue = products.reduce(
    (total, product) => total + product.quantity * product.price,
    0
  );
  const distributedProductCount = products.filter((product) =>
    (product.distributions || []).some((allocation) => allocation.quantity > 0)
  ).length;
  const distributedUnitCount = products.reduce((total, product) =>
    total + (product.distributions || []).reduce((productTotal, allocation) => productTotal + allocation.quantity, 0), 0
  );
  const assignedAllocations = products.flatMap((product) =>
    (product.distributions || [])
      .filter((allocation) => allocation.quantity > 0)
      .map((allocation) => ({ product, allocation }))
  );
  const recentTransfers = transactions.filter((transaction) => ["TRANSFER", "RETURN"].includes(transaction.type)).slice(0, 4);
  const activeTransferRecipients = teamMembers.filter((member) =>
    member.status === "active" && ["manager", "staff"].includes(member.role) && member._id !== user._id
  );
  const selectedProductDistributions = selectedProduct?.product?.distributions || [];
  const selectedProductDistributedQuantity = selectedProductDistributions.reduce((total, allocation) => total + allocation.quantity, 0);
  const selectedReturnAllocation = transferAction?.type === "RETURN"
    ? (transferAction.product.distributions || []).find((allocation) => String(allocation.user?._id || allocation.user) === transferForm.recipientUserId)
    : null;
  const highRiskDecisionCount = inventoryDecisions.filter((decision) => decision.risk === "HIGH").length;
  const selectedSimulatorProduct = products.find((product) => product._id === simulationForm.productId);

  const inventoryInsights = products
    .filter((product) => product.quantity <= product.lowStockThreshold)
    .map((product) => ({
      ...product,
      isOutOfStock: product.quantity === 0,
      recommendedReorder: Math.max(product.lowStockThreshold * 2 - product.quantity, 0),
      recommendation: product.quantity === 0
        ? "Restock immediately to avoid missed sales."
        : "Restock soon to bring inventory back to a comfortable level."
    }));

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]
    .sort((firstCategory, secondCategory) => firstCategory.localeCompare(secondCategory));

  const visibleProducts = [...products]
    .filter((product) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch = !normalizedSearch ||
        [product.name, product.category, product.supplier]
          .some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "out-of-stock" && product.quantity === 0) ||
        (statusFilter === "low-stock" && product.quantity > 0 && product.quantity <= product.lowStockThreshold) ||
        (statusFilter === "in-stock" && product.quantity > product.lowStockThreshold);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    })
    .sort((firstProduct, secondProduct) => {
      switch (sortOrder) {
        case "name-asc": return firstProduct.name.localeCompare(secondProduct.name);
        case "name-desc": return secondProduct.name.localeCompare(firstProduct.name);
        case "quantity-asc": return firstProduct.quantity - secondProduct.quantity;
        case "quantity-desc": return secondProduct.quantity - firstProduct.quantity;
        case "price-asc": return firstProduct.price - secondProduct.price;
        case "price-desc": return secondProduct.price - firstProduct.price;
        case "newest":
        default: return new Date(secondProduct.createdAt || 0) - new Date(firstProduct.createdAt || 0);
      }
    });

  const pagedProducts = paginateItems(visibleProducts, productPage);
  const pagedTransactions = paginateItems(transactions, transactionPage);
  const filteredDeadStockItems = deadStockItems.filter((item) => deadStockFilter === "all" || item.status === deadStockFilter);
  const pagedDeadStockItems = paginateItems(filteredDeadStockItems, deadStockPage);
  const pagedTeamMembers = paginateItems(teamMembers, teamPage);
  const pagedDecisions = paginateItems(inventoryDecisions, decisionPage);
  const pagedForecasts = paginateItems(forecasts, forecastPage);
  const pagedProductDistributions = paginateItems(selectedProductDistributions, productDistributionPage);
  const memberDistributedInventory = selectedMember?.distributedInventory || [];
  const pagedMemberInventory = paginateItems(memberDistributedInventory, memberInventoryPage);
  const anomalyTypes = [...new Set(anomalies.map((anomaly) => anomaly.anomalyType))].sort();
  const visibleAnomalies = anomalies.filter((anomaly) =>
    (anomalySeverityFilter === "all" || anomaly.severity === anomalySeverityFilter)
    && (anomalyTypeFilter === "all" || anomaly.anomalyType === anomalyTypeFilter)
  );
  const pagedAnomalies = paginateItems(visibleAnomalies, anomalyPage);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSortOrder("newest");
    setProductPage(1);
  };

  const navigateToPage = (path) => {
    navigate(path);
    if (path === "/dead-stock") fetchDeadStock();
    setIsMobileNavOpen(false);
    setIsNotificationsOpen(false);
    setOpenProductMenuId(null);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const upcomingItems = [
    { label: "Reports", icon: "file" },
    { label: "Suppliers", icon: "truck" },
    { label: "Settings", icon: "settings" }
  ];

  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!page) return <Navigate to="/dashboard" replace />;

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {isMobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar ${isMobileNavOpen ? "mobile-open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-brand-row">
          <Link className="brand" to="/dashboard" aria-label="StockSutra home" onClick={() => { setIsMobileNavOpen(false); setOpenProductMenuId(null); }}>
            <img className="brand-logo" src="/stocksutralogo.webp" alt="" />
            {!isSidebarCollapsed && <span>Stock<span className="brand-accent">Sutra</span></span>}
          </Link>
          <button
            className="icon-button sidebar-collapse-button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name="chevron" size={16} />
          </button>
          <button
            className="icon-button mobile-sidebar-close"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {!isSidebarCollapsed && <p className="sidebar-caption">WORKSPACE</p>}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              className={`sidebar-link ${location.pathname === item.path ? "active" : ""}`}
              to={item.path}
              key={item.label}
              title={isSidebarCollapsed ? item.label : undefined}
              onClick={() => { setIsMobileNavOpen(false); setOpenProductMenuId(null); if (item.path === "/dead-stock") fetchDeadStock(); }}
            >
              <Icon name={item.icon} />
              {!isSidebarCollapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {!isSidebarCollapsed && <p className="sidebar-caption secondary-caption">MANAGE</p>}
        <nav className="sidebar-nav secondary-nav" aria-label="Upcoming sections">
          {upcomingItems.map((item) => (
            <button
              className="sidebar-link disabled-link"
              type="button"
              disabled
              key={item.label}
              title={`${item.label} coming soon`}
            >
              <Icon name={item.icon} />
              {!isSidebarCollapsed && <><span>{item.label}</span><small>SOON</small></>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>
            {!isSidebarCollapsed && (
              <span className="sidebar-user-copy">
                <strong>{user.name}</strong>
                <small>{user.role[0].toUpperCase() + user.role.slice(1)}</small>
              </span>
            )}
          </div>
          <button className="sidebar-logout" onClick={logout} title="Log out">
            <Icon name="logout" />
            {!isSidebarCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Icon name="menu" />
            </button>
            <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{page?.title}</strong></div>
          </div>

          <div className="topbar-actions">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") navigateToPage("/inventory");
                }}
                placeholder="Search inventory..."
                aria-label="Search inventory"
              />
              <kbd>/</kbd>
            </label>

            <div className="popover-wrap">
              <button
                className={`icon-button notification-button ${isNotificationsOpen ? "selected" : ""}`}
                aria-label={`Notifications, ${inventoryInsights.length} inventory alerts`}
                aria-expanded={isNotificationsOpen}
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsProfileOpen(false);
                }}
              >
                <Icon name="bell" />
                {inventoryInsights.length > 0 && <span className="notification-dot" />}
              </button>
              {isNotificationsOpen && (
                <div className="popover notification-popover">
                  <div className="popover-heading"><strong>Inventory alerts</strong><span>{inventoryInsights.length}</span></div>
                  {inventoryInsights.length === 0 ? (
                    <div className="popover-empty"><Icon name="check" /><span>No inventory alerts right now.</span></div>
                  ) : inventoryInsights.slice(0, 5).map((insight) => (
                    <button
                      className="notification-item"
                      key={insight._id}
                      onClick={() => {
                        setIsNotificationsOpen(false);
                        navigateToPage("/ai-insights");
                      }}
                    >
                      <span className={`notification-indicator ${insight.isOutOfStock ? "danger-indicator" : "warning-indicator"}`} />
                      <span><strong>{insight.name}</strong><small>{insight.isOutOfStock ? "Out of stock" : "Low stock"}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="popover-wrap profile-wrap">
              <button
                className="profile-trigger"
                aria-expanded={isProfileOpen}
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotificationsOpen(false);
                }}
              >
                <span className="avatar">{initials}</span>
                <span className="profile-trigger-copy"><strong>{user.name}</strong><small>{user.role[0].toUpperCase() + user.role.slice(1)}</small></span>
                <Icon name="down" size={14} />
              </button>
              {isProfileOpen && (
                <div className="popover profile-popover">
                  <div className="profile-popover-user"><span className="avatar">{initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
                  <span className="role-badge">{user.role}</span>
                  <button className="popover-logout" onClick={logout}><Icon name="logout" size={16} />Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`page-content ${isDashboardPage ? "dashboard-page-content" : ""}`} key={location.pathname}>
          {isDashboardPage ? <section className="welcome-panel dashboard-hero">
            <img className="dashboard-hero-image" src="/stocksutradashboard.jpg" alt="" aria-hidden="true" />
            <div className="dashboard-hero-overlay" aria-hidden="true" />
            <div className="dashboard-hero-copy">
              <p className="eyebrow">INVENTORY OVERVIEW</p>
              <h1>{greeting()}, {user.name.split(" ")[0]}</h1>
              <p>Here's what's happening with your inventory today.</p>
            </div>
            {canManageProducts && <button className="primary-button dashboard-hero-action" onClick={openNewProductForm}>
              <Icon name="plus" size={17} /> Add product
            </button>}
          </section> : <section className="page-heading">
            <h1>{page?.title}</h1>
            <p>{page?.subtitle}</p>
          </section>}

          {isAssistantPage && <section className="assistant-page" aria-label="Inventory Assistant">
            <div className="content-card assistant-chat-card">
              <div className="assistant-intro">
                <span className="assistant-intro-icon"><Icon name="sparkle" size={21} /></span>
                <div><h2>Ask StockSutra anything...</h2><p>Get clear answers grounded in your workspace inventory and recorded stock activity.</p></div>
                {assistantMessages.length > 0 && <button className="text-button assistant-clear-button" type="button" onClick={clearAssistantConversation} disabled={assistantLoading}>New conversation</button>}
              </div>

              {assistantMessages.length === 0 ? <div className="assistant-suggestions">
                <p>Suggested questions</p>
                <div>{[
                  "Which products should I reorder?",
                  "Which products are high risk?",
                  "Show me unusual inventory activity.",
                  "Which products are low in stock?",
                  "Which product has the highest demand?",
                  "How much inventory is assigned to my team?",
                  "Show recent transactions for Laptop."
                ].map((suggestion) => <button type="button" className="assistant-suggestion" key={suggestion} onClick={() => askInventoryAssistant(suggestion)} disabled={assistantLoading}>{suggestion}<Icon name="chevron" size={14} /></button>)}</div>
              </div> : <div className="assistant-conversation" aria-live="polite" aria-label="Conversation">
                {assistantMessages.map((message, index) => <article className={`assistant-message assistant-message-${message.role} ${message.error ? "has-error" : ""}`} key={`${message.role}-${index}`}>
                  <span className="assistant-message-author">{message.role === "user" ? "You" : "StockSutra"}</span>
                  <p>{message.role === "user" ? message.text : message.answer}</p>
                  {message.role === "assistant" && !message.error && message.products?.length > 0 && <div className="assistant-product-results">
                    {message.products.map((item) => <article className="assistant-product-card" key={`${item.productId}-${item.anomalyType || item.action || "result"}`}>
                      <div className="assistant-product-card-top">
                        <div className="assistant-product-identity">
                          {item.image ? <img src={`${API_ORIGIN}${item.image}`} alt="" /> : <span className="assistant-product-icon"><Icon name="package" size={17} /></span>}
                          <strong>{item.name}</strong>
                        </div>
                        <div className="assistant-product-badges">
                          {item.severity && <span className={`assistant-result-badge assistant-severity-${item.severity.toLowerCase()}`}>{item.severity}</span>}
                          {item.risk && <span className={`assistant-result-badge assistant-risk-${item.risk.toLowerCase()}`}>{item.risk} RISK</span>}
                          {item.action && <span className={`assistant-result-badge assistant-action-${item.action.toLowerCase().replaceAll("_", "-")}`}>{item.action.replaceAll("_", " ")}</span>}
                          {item.anomalyType && <span className="assistant-result-label">{item.anomalyType.replaceAll("_", " ")}</span>}
                        </div>
                      </div>
                      <dl className="assistant-product-metrics">
                        <div><dt>Current stock</dt><dd>{formatDecisionValue(item.currentStock, " units")}</dd></div>
                        {item.lowStockThreshold !== null && <div><dt>Low-stock threshold</dt><dd>{formatDecisionValue(item.lowStockThreshold, " units")}</dd></div>}
                        {item.averageDailyDemand !== null && <div><dt>Avg. demand</dt><dd>{formatDecisionValue(item.averageDailyDemand, " units/day")}</dd></div>}
                        {item.reorderPoint !== null && <div><dt>Reorder point</dt><dd>{formatDecisionValue(item.reorderPoint, " units")}</dd></div>}
                        {item.recommendedOrderQuantity !== null && <div><dt>Recommended order</dt><dd>{formatDecisionValue(item.recommendedOrderQuantity, " units")}</dd></div>}
                        {item.deviation && <div><dt>Deviation</dt><dd>+{item.deviation.percent}%</dd></div>}
                      </dl>
                      {item.explanation && <p className="assistant-product-explanation">{item.explanation}</p>}
                      <Link className="assistant-product-link" to="/inventory" onClick={() => setIsMobileNavOpen(false)}>View in inventory <Icon name="chevron" size={14} /></Link>
                    </article>)}
                  </div>}
                  {message.role === "assistant" && !message.error && message.insights?.length > 0 && <div className="assistant-insights-list">
                    {message.insights.map((insight, insightIndex) => insight.type ? <div className="assistant-transaction-result" key={`${insight.productName}-${insight.detectedAt}-${insightIndex}`}><strong>{insight.productName} · {insight.type}</strong><span>{insight.quantity} units · {insight.performedBy}</span>{insight.note && <small>{insight.note}</small>}</div>
                      : <div className="assistant-insight-value" key={`${insight.label}-${insightIndex}`}><span>{insight.label}</span><strong>{insight.currency === "INR" ? `₹${Number(insight.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `${Number(insight.value).toLocaleString()} ${insight.unit || ""}`}</strong></div>)}
                  </div>}
                </article>)}
                {assistantLoading && <div className="assistant-thinking" role="status"><span className="decision-spinner" aria-hidden="true" />Analyzing your inventory...</div>}
              </div>}

              {assistantMessages.length === 0 && assistantLoading && <div className="assistant-thinking" role="status"><span className="decision-spinner" aria-hidden="true" />Analyzing your inventory...</div>}
              <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); askInventoryAssistant(); }}>
                <label className="sr-only" htmlFor="assistant-question">Ask StockSutra anything</label>
                <textarea id="assistant-question" value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask StockSutra anything..." rows="2" maxLength="500" disabled={assistantLoading} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); askInventoryAssistant(); } }} />
                <button className="primary-button" type="submit" disabled={assistantLoading || !assistantQuestion.trim()}><Icon name="chevron" size={17} />{assistantLoading ? "Thinking..." : "Ask"}</button>
              </form>
              <p className="assistant-data-note">Answers use your authorized inventory records and existing StockSutra calculations. No external AI service is used.</p>
            </div>
          </section>}

          {isDeadStockPage && <section className="dead-stock-page" aria-labelledby="dead-stock-heading">
            <div className="dead-stock-summary-grid" aria-label="Dead-stock summary">
              <article className="content-card dead-stock-summary-card"><span>Dead Stock Items</span><strong>{deadStockLoading ? "…" : (deadStockSummary?.deadStockItems || 0).toLocaleString()}</strong></article>
              <article className="content-card dead-stock-summary-card"><span>Slow moving</span><strong>{deadStockLoading ? "…" : (deadStockSummary?.slowMovingItems || 0).toLocaleString()}</strong></article>
              <article className="content-card dead-stock-summary-card"><span>Excess stock</span><strong>{deadStockLoading ? "…" : (deadStockSummary?.excessStockItems || 0).toLocaleString()}</strong></article>
              <article className="content-card dead-stock-summary-card"><span>Estimated tied-up value</span><strong>{deadStockLoading ? "…" : deadStockSummary?.estimatedTiedUpValue == null ? "Unavailable" : `₹${Number(deadStockSummary.estimatedTiedUpValue).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}</strong><small>Based on saved product prices</small></article>
            </div>
            <div className="content-card dead-stock-card">
              <div className="section-heading dead-stock-heading"><div><p className="eyebrow">MOVEMENT ANALYSIS</p><h2 id="dead-stock-heading">Inventory movement and exposure</h2><p>Uses recorded stock-out transactions from the last 90 days. Recommendations are informational and never change stock or orders.</p></div>
                <label className="dead-stock-filter">Status<select value={deadStockFilter} onChange={(event) => { setDeadStockFilter(event.target.value); setDeadStockPage(1); }}><option value="all">All</option><option value="NO_MOVEMENT">Dead Stock</option><option value="SLOW_MOVING">Slow Moving</option><option value="EXCESS_STOCK">Excess Stock</option><option value="INSUFFICIENT_DATA">Insufficient Data</option><option value="ACTIVE">Active</option></select></label>
              </div>
              {deadStockError ? <div className="dead-stock-state" role="alert">{deadStockError}<button type="button" className="secondary-button" onClick={fetchDeadStock}>Try again</button></div>
                : deadStockLoading ? <div className="dead-stock-state" role="status">Analyzing recorded stock movements…</div>
                : filteredDeadStockItems.length === 0 ? <div className="dead-stock-state">{deadStockItems.length ? "No products match this status." : "No products are available for this workspace."}</div>
                : <>
                  <div className="dead-stock-table-wrap"><table className="dead-stock-table"><thead><tr><th>Product</th><th>Current stock</th><th>Last movement</th><th>Out in 90 days</th><th>Avg. daily demand</th><th>Coverage</th><th>Estimated value</th><th>Status / action</th><th>Analysis</th></tr></thead>
                    <tbody>{pagedDeadStockItems.items.map((item) => <tr key={item.productId}>
                      <td><strong>{item.name}</strong>{item.sku && <small>SKU {item.sku}</small>}</td><td>{item.currentStock.toLocaleString()} units</td>
                      <td>{item.lastMovementAt ? <>{new Date(item.lastMovementAt).toLocaleDateString()}<small>{item.daysSinceLastMovement} days ago</small></> : "No history"}</td>
                      <td>{item.outQuantity90Days.toLocaleString()} units</td><td>{item.averageDailyOutDemand == null ? "Insufficient data" : `${item.averageDailyOutDemand} units/day`}</td>
                      <td>{item.daysOfStockCoverage == null ? "—" : `${item.daysOfStockCoverage} days`}</td><td>{item.estimatedTiedUpValue == null ? "Unavailable" : `₹${Number(item.estimatedTiedUpValue).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}</td>
                      <td><span className="dead-stock-badge">{item.status.replaceAll("_", " ")}</span><small><span className={`dead-stock-severity-text severity-${item.severity.toLowerCase()}`}>{item.severity}</span> · {item.recommendedAction.replaceAll("_", " ")}</small></td>
                      <td><button type="button" className="text-button" onClick={() => setSelectedDeadStock(item)}>Why?</button></td>
                    </tr>)}</tbody>
                  </table></div>
                  <div className="dead-stock-mobile-list">{pagedDeadStockItems.items.map((item) => <article className="dead-stock-mobile-item" key={item.productId}>
                    <div className="dead-stock-mobile-title"><strong>{item.name}</strong><span className="dead-stock-badge">{item.status.replaceAll("_", " ")}</span></div>
                    <dl><div><dt>Current stock</dt><dd>{item.currentStock.toLocaleString()} units</dd></div><div><dt>Last movement</dt><dd>{item.daysSinceLastMovement == null ? "No history" : `${item.daysSinceLastMovement} days ago`}</dd></div><div><dt>Out in 90 days</dt><dd>{item.outQuantity90Days.toLocaleString()} units</dd></div><div><dt>Avg. demand</dt><dd>{item.averageDailyOutDemand == null ? "Insufficient data" : `${item.averageDailyOutDemand} units/day`}</dd></div><div><dt>Coverage</dt><dd>{item.daysOfStockCoverage == null ? "—" : `${item.daysOfStockCoverage} days`}</dd></div><div><dt>Estimated value</dt><dd>{item.estimatedTiedUpValue == null ? "Unavailable" : `₹${Number(item.estimatedTiedUpValue).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}</dd></div></dl>
                    <p><span className={`dead-stock-severity-text severity-${item.severity.toLowerCase()}`}>{item.severity}</span> · {item.recommendedAction.replaceAll("_", " ")}</p><button className="text-button" type="button" onClick={() => setSelectedDeadStock(item)}>View analysis</button>
                  </article>)}</div>
                  <Pagination page={pagedDeadStockItems.page} pageCount={pagedDeadStockItems.pageCount} total={filteredDeadStockItems.length} itemName="products" label="Dead stock" onPageChange={setDeadStockPage} />
                  {deadStockSummary?.insufficientDataItems > 0 && <p className="dead-stock-data-note">{deadStockSummary.insufficientDataItems} product(s) have fewer than 3 recorded stock-out transactions and are marked insufficient data. No movement is not inferred for them.</p>}
                </>}
            </div>
          </section>}

          {isDashboardPage && <section className="kpi-grid" aria-label="Inventory overview statistics">
            <article className="kpi-card">
              <span className="kpi-icon icon-indigo"><Icon name="package" /></span>
              <p>Total products</p>
              <h2>{productsLoading ? <Skeleton className="skeleton-value" /> : totalProducts.toLocaleString()}</h2>
              <small>Products in your inventory</small>
            </article>
            <article className="kpi-card">
              <span className="kpi-icon icon-indigo"><Icon name="boxes" /></span>
              <p>Total inventory</p>
              <h2>{productsLoading ? <Skeleton className="skeleton-value" /> : totalInventoryUnits.toLocaleString()}</h2>
              <small>Units across your products</small>
            </article>
            <article className="kpi-card">
              <span className="kpi-icon icon-green"><Icon name="rupee" /></span>
              <p>Inventory value</p>
              <h2>{productsLoading ? <Skeleton className="skeleton-value" /> : `₹${inventoryValue.toLocaleString()}`}</h2>
              <small>Current quantity × unit price</small>
            </article>
            <article className="kpi-card">
              <span className="kpi-icon icon-amber"><Icon name="warning" /></span>
              <p>Low stock</p>
              <h2>{productsLoading ? <Skeleton className="skeleton-value" /> : lowStockProducts.toLocaleString()}</h2>
              <small>Products at or below threshold</small>
            </article>
            <article className="kpi-card">
              <span className="kpi-icon icon-rose"><Icon name="activity" /></span>
              <p>Out of stock</p>
              <h2>{productsLoading ? <Skeleton className="skeleton-value" /> : outOfStockProducts.toLocaleString()}</h2>
              <small>Products with zero quantity</small>
            </article>
          </section>}

          {isDashboardPage && <section className="dashboard-overview-grid" aria-label="Inventory status and recent activity">
            <article className="content-card dashboard-summary-card">
              <div className="section-heading"><div><p className="eyebrow">INVENTORY HEALTH</p><h2>Needs attention</h2></div><button className="text-button" onClick={() => navigateToPage("/ai-insights")}>View insights →</button></div>
              {productsLoading ? <p className="dashboard-muted">Checking current stock levels…</p> : inventoryInsights.length === 0
                ? <p className="dashboard-health"><span className="healthy-icon"><Icon name="check" size={16} /></span>All products are above their low-stock thresholds.</p>
                : <div className="dashboard-alert-list">{inventoryInsights.slice(0, 4).map((item) => <div key={item._id}><strong>{item.name}</strong><span>{item.isOutOfStock ? "Out of stock" : `${item.quantity} units · threshold ${item.lowStockThreshold}`}</span></div>)}</div>}
            </article>
            <article className="content-card dashboard-summary-card">
              <div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest movements</h2></div><button className="text-button" onClick={() => navigateToPage("/transactions")}>View transactions →</button></div>
              {transactionsLoading && transactions.length === 0 ? <p className="dashboard-muted">Loading recent movements…</p> : transactions.length === 0
                ? <p className="dashboard-muted">No inventory movements recorded yet.</p>
                : <div className="dashboard-alert-list">{transactions.slice(0, 4).map((transaction) => <div key={transaction._id}><strong>{transaction.productName}</strong><span>{transaction.type} · {transaction.quantity} units · {new Date(transaction.createdAt).toLocaleDateString()}</span></div>)}</div>}
            </article>
          </section>}

          {(isDashboardPage || isAssignedPage) && transferFeedback && <div className="team-feedback transfer-feedback" role="status"><span>{transferFeedback}</span><button className="text-button" onClick={() => setTransferFeedback("")}>Dismiss</button></div>}

          {isAssignedPage && <section className="content-card distribution-overview" aria-labelledby="distribution-overview-title">
            <div className="section-heading">
              <div><p className="eyebrow">STOCK ALLOCATION</p><h2 id="distribution-overview-title">Distributed inventory</h2><p>Stock currently held by your team members.</p></div>
              <span className="subtle-count">{distributedProductCount} {distributedProductCount === 1 ? "product" : "products"}</span>
            </div>
            <div className="distribution-overview-grid">
              <div className="distribution-stat"><span className="kpi-icon icon-indigo"><Icon name="boxes" /></span><span><strong>{productsLoading ? "—" : distributedProductCount.toLocaleString()}</strong><small>Products distributed</small></span></div>
              <div className="distribution-stat"><span className="kpi-icon icon-green"><Icon name="team" /></span><span><strong>{productsLoading ? "—" : distributedUnitCount.toLocaleString()}</strong><small>Units held by team</small></span></div>
              <div className="distribution-stat"><span className="kpi-icon icon-amber"><Icon name="package" /></span><span><strong>{productsLoading ? "—" : totalInventoryUnits.toLocaleString()}</strong><small>Units in Main Inventory</small></span></div>
              <div className="recent-transfer-list">
                <strong>Recent transfers</strong>
                {recentTransfers.length === 0
                  ? <small>No stock transfers recorded yet.</small>
                  : recentTransfers.map((transaction) => <span key={transaction._id}><b>{transaction.productName}</b><small>{transaction.sourceLocation} → {transaction.destinationLocation} · {transaction.quantity} units</small></span>)}
              </div>
            </div>
            <div className="assigned-allocation-list">
              <div className="assigned-list-heading"><h3>Assigned stock</h3>{canManageProducts && <button className="secondary-button" onClick={() => navigateToPage("/inventory")}>Manage products</button>}</div>
              {productsLoading ? <div className="table-skeleton" aria-label="Loading assigned inventory"><Skeleton className="skeleton-row" /><Skeleton className="skeleton-row" /></div> : assignedAllocations.length === 0
                ? <div className="empty-state compact-empty"><span className="empty-icon"><Icon name="boxes" size={22} /></span><h3>No stock is assigned yet</h3><p>Distribute product quantities to team members from the Inventory page.</p></div>
                : <div className="table-scroll" role="region" aria-label="Assigned inventory table" tabIndex="0"><table className="data-table"><thead><tr><th>Product</th><th>Team member</th><th>Role</th><th>Quantity held</th><th>Action</th></tr></thead><tbody>
                  {assignedAllocations.map(({ product, allocation }, index) => {
                    const recipient = allocation.user;
                    const recipientId = String(recipient?._id || recipient);
                    return <tr key={`${product._id}-${recipientId}-${index}`}><td data-label="Product"><strong>{product.name}</strong></td><td data-label="Team member">{recipient?.name || "Team member"}</td><td data-label="Role">{recipient?.role || "—"}</td><td data-label="Quantity held">{allocation.quantity.toLocaleString()} units</td><td data-label="Action">{canManageProducts && <div className="assigned-row-actions"><button className="text-button" type="button" onClick={() => openTransferAction(product)}>Distribute more</button><button className="text-button" type="button" onClick={() => openTransferAction(product, "RETURN", recipientId)}>Return stock</button></div>}</td></tr>;
                  })}
                </tbody></table></div>}
            </div>
          </section>}

          {isInventoryPage && <section className="content-card inventory-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PRODUCT CATALOG</p>
                <h2>Inventory</h2>
                <p>Search, review, and manage your stock.</p>
              </div>
              {canManageProducts && <button className="secondary-button" onClick={openNewProductForm}>
                <Icon name="plus" size={16} /> Add product
              </button>}
            </div>

            <div className="filter-toolbar" aria-label="Inventory filters">
              <label className="table-search">
                <Icon name="search" size={16} />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => { setSearchTerm(event.target.value); setProductPage(1); }}
                  placeholder="Search products..."
                  aria-label="Search by product, category, or supplier"
                />
              </label>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setProductPage(1); }} aria-label="Filter by stock status">
                <option value="all">All statuses</option>
                <option value="in-stock">In stock</option>
                <option value="low-stock">Low stock</option>
                <option value="out-of-stock">Out of stock</option>
              </select>
              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setProductPage(1); }} aria-label="Filter by category">
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setProductPage(1); }} aria-label="Sort inventory">
                <option value="newest">Newest</option>
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
                <option value="quantity-asc">Quantity low–high</option>
                <option value="quantity-desc">Quantity high–low</option>
                <option value="price-asc">Price low–high</option>
                <option value="price-desc">Price high–low</option>
              </select>
            </div>

            {productsError && (
              <div className="inline-error" role="alert">
                <Icon name="warning" size={17} /><span>{productsError}</span>
                <button className="text-button" onClick={fetchProducts}>Retry</button>
              </div>
            )}

            {productsLoading && products.length === 0 ? (
              <div className="table-skeleton" aria-label="Loading inventory">
                {Array.from({ length: 5 }, (_, index) => <Skeleton className="skeleton-row" key={index} />)}
              </div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><Icon name="boxes" size={24} /></span>
                <h3>Your inventory is ready to take shape</h3>
                <p>Add your first product to start tracking stock and inventory value.</p>
                <button className="secondary-button" onClick={openNewProductForm}><Icon name="plus" size={16} /> Add your first product</button>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="empty-state compact-empty">
                <span className="empty-icon"><Icon name="search" size={22} /></span>
                <h3>No products match these filters</h3>
                <p>Adjust your search or clear the selected filters.</p>
                <button className="text-button" onClick={clearFilters}>Clear filters</button>
              </div>
            ) : (
              <div className="table-scroll" role="region" aria-label="Inventory table" tabIndex="0">
                <table className="data-table inventory-table">
                  <thead>
                    <tr><th>Product</th><th>Category</th><th>Quantity</th><th>Unit price</th><th>Supplier</th><th>Assigned to</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {pagedProducts.items.map((product) => {
                      const status = product.quantity === 0
                        ? "Out of stock"
                        : product.quantity <= product.lowStockThreshold ? "Low stock" : "In stock";
                      return (
                        <tr key={product._id}>
                          <td data-label="Product">
                            <div className="product-cell">
                              <button className="image-thumb-button" type="button" onClick={() => openProductDetails(product)} aria-label={`View details for ${product.name}`}>
                                {product.image ? <img className="product-thumbnail" src={`${API_ORIGIN}${product.image}`} alt="" /> : <span className="product-avatar">{product.name.slice(0, 1).toUpperCase()}</span>}
                              </button>
                              <span><button className="product-name-button" type="button" onClick={() => openProductDetails(product)}>{product.name}</button><small>Threshold {product.lowStockThreshold} units</small></span>
                            </div>
                          </td>
                          <td data-label="Category">{product.category}</td>
                          <td data-label="Quantity"><strong>{product.quantity}</strong> <span className="muted">units</span></td>
                          <td data-label="Unit price">₹{product.price.toLocaleString()}</td>
                          <td data-label="Supplier">{product.supplier || <span className="muted">Not set</span>}</td>
                          <td data-label="Assigned to">{product.assignedTo?.name || <span className="muted">Unassigned</span>}</td>
                          <td data-label="Status"><span className={`status-badge ${status.replaceAll(" ", "-")}`}>{status}</span></td>
                          <td data-label="Actions" className="actions-cell">
                            <div className="row-actions-menu">
                              <button
                                className="row-actions-toggle"
                                type="button"
                                aria-label={`Actions for ${product.name}`}
                                aria-haspopup="menu"
                                aria-expanded={openProductMenuId === product._id}
                                aria-controls={`product-actions-${product._id}`}
                                title="Product actions"
                                onClick={(event) => toggleProductMenu(event, product._id)}
                              >•••</button>
                              {openProductMenuId === product._id && createPortal(<div
                                ref={productMenuRef}
                                className="row-actions-popover"
                                id={`product-actions-${product._id}`}
                                role="menu"
                                style={{ top: productMenuPosition.top, left: productMenuPosition.left }}
                              >
                                <button type="button" role="menuitem" onClick={() => runProductMenuAction(() => openStockAction(product, "IN"))}>Stock in</button>
                                <button type="button" role="menuitem" onClick={() => runProductMenuAction(() => openStockAction(product, "OUT"))}>Stock out</button>
                                {canManageProducts && <><button type="button" role="menuitem" onClick={() => runProductMenuAction(() => openTransferAction(product))}>Distribute stock</button><button type="button" role="menuitem" onClick={() => runProductMenuAction(() => handleEdit(product))}>Edit product</button><button type="button" role="menuitem" className="danger-action" onClick={() => runProductMenuAction(() => handleDelete(product._id))}>Delete product</button></>}
                              </div>, document.body)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={pagedProducts.page}
              pageCount={pagedProducts.pageCount}
              total={visibleProducts.length}
              itemName="products"
              label="Inventory products"
              onPageChange={setProductPage}
            />
          </section>}

          {isTeamPage && <section className="content-card team-card">
            <div className="section-heading">
              <div><p className="eyebrow">WORKSPACE</p><h2>Team management</h2><p>Manage workspace members and product responsibilities.</p></div>
              {isAdmin && <button className="secondary-button" onClick={() => { setShowInviteForm(!showInviteForm); setInviteFeedback(null); }}><Icon name="plus" size={16} /> Add member</button>}
            </div>
            <div className="team-summary"><span><strong>{teamMembers.length}</strong> team members</span><span><strong>{products.filter((product) => product.assignedTo).length}</strong> assigned products</span><span><strong>{products.filter((product) => !product.assignedTo).length}</strong> unassigned products</span><span><strong>{distributedUnitCount}</strong> distributed units</span></div>
            {teamError && <div className="inline-error" role="alert"><Icon name="warning" size={17} /><span>{teamError}</span><button className="text-button" onClick={fetchTeam}>Retry</button></div>}
            {inviteFeedback && <div className="team-feedback" role="status"><span>{inviteFeedback.message}</span>{inviteFeedback.temporaryPassword && <span className="temporary-password"><strong>{inviteFeedback.email}</strong> temporary password: <code>{inviteFeedback.temporaryPassword}</code></span>}</div>}
            {showInviteForm && isAdmin && <form className="invite-form" onSubmit={handleInviteSubmit}>
              <label className="form-field"><span>Name</span><input value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} required /></label>
              <label className="form-field"><span>Email</span><input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required /></label>
              <label className="form-field"><span>Role</span><select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option></select></label>
              <div className="invite-form-actions"><button type="button" className="secondary-button" onClick={() => setShowInviteForm(false)}>Cancel</button><button className="primary-button" type="submit">Create member account</button></div>
              <p className="form-help">No email is sent. A temporary password will be displayed once after account creation.</p>
            </form>}
            {teamLoading ? <div className="table-skeleton" aria-label="Loading team">{Array.from({ length: 2 }, (_, index) => <Skeleton className="skeleton-row" key={index} />)}</div> : teamMembers.length === 0 ? <div className="empty-state compact-empty"><h3>No team members yet</h3><p>Add a member to collaborate in this workspace.</p></div> : (
              <>
              <div className="table-scroll" role="region" aria-label="Workspace team table" tabIndex="0"><table className="data-table team-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
                {pagedTeamMembers.items.map((member) => <tr key={member._id}>
                  <td data-label="Member"><button type="button" className="team-member-button" onClick={() => { setMemberInventoryPage(1); setSelectedMember(member); }}><span className="avatar">{member.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong></button></td>
                  <td data-label="Email">{member.email}</td><td data-label="Role"><span className={`role-badge role-${member.role}`}>{member.role}</span></td>
                  <td data-label="Status"><span className={`status-badge ${member.status === "active" ? "in-stock" : "out-of-stock"}`}>{member.status}</span></td>
                  <td data-label="Joined">{new Date(member.createdAt).toLocaleDateString()}</td>
                  <td data-label="Actions">{isAdmin && member.role !== "admin" && member.status === "active" ? <div className="team-row-actions"><select value={member.role} onChange={(event) => updateMemberRole(member, event.target.value)} aria-label={`Change role for ${member.name}`}><option value="staff">Staff</option><option value="manager">Manager</option></select><button className="text-button danger-text-button" onClick={() => deactivateMember(member)}>Deactivate</button></div> : <span className="muted">{member.role === "admin" ? "Workspace owner" : "—"}</span>}</td>
                </tr>)}
              </tbody></table></div>
              <Pagination page={pagedTeamMembers.page} pageCount={pagedTeamMembers.pageCount} total={teamMembers.length} itemName="team members" label="Team members" onPageChange={setTeamPage} />
              </>
            )}
          </section>}

          {isTransactionsPage && <section className="content-card history-card">
            <div className="section-heading">
              <div><p className="eyebrow">STOCK MOVEMENT</p><h2>Inventory history</h2><p>A record of stock received and stock removed.</p></div>
              <span className="subtle-count">{transactions.length} {transactions.length === 1 ? "transaction" : "transactions"}</span>
            </div>
            {transactionsError && (
              <div className="inline-error" role="alert"><Icon name="warning" size={17} /><span>{transactionsError}</span><button className="text-button" onClick={fetchTransactions}>Retry</button></div>
            )}
            {transactionsLoading && transactions.length === 0 ? (
              <div className="table-skeleton" aria-label="Loading inventory history">{Array.from({ length: 3 }, (_, index) => <Skeleton className="skeleton-row" key={index} />)}</div>
            ) : transactions.length === 0 ? (
              <div className="empty-state compact-empty">
                <span className="empty-icon"><Icon name="activity" size={22} /></span>
                <h3>No stock movement yet</h3><p>Use Stock in or Stock out on a product to create the first history entry.</p>
              </div>
            ) : (
              <>
              <div className="table-scroll" role="region" aria-label="Inventory history table" tabIndex="0">
                <table className="data-table history-table">
                  <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Quantity</th><th>Previous stock</th><th>New stock</th><th>Performed by</th><th>Note</th></tr></thead>
                  <tbody>
                    {pagedTransactions.items.map((transaction) => (
                      <tr key={transaction._id}>
                        <td data-label="Date">{new Date(transaction.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td data-label="Product"><strong>{transaction.productName}</strong>{transaction.sourceLocation && <small className="cell-note">{transaction.sourceLocation} → {transaction.destinationLocation}</small>}</td>
                        <td data-label="Type"><span className={`transaction-type ${transaction.type === "IN" ? "transaction-in" : transaction.type === "OUT" ? "transaction-out" : transaction.type === "RETURN" ? "transaction-return" : "transaction-transfer"}`}>{transaction.type === "IN" ? "Stock in" : transaction.type === "OUT" ? "Stock out" : transaction.type === "RETURN" ? "Return" : "Transfer"}</span></td>
                        <td data-label="Quantity">{transaction.quantity}</td>
                        <td data-label="Previous stock">{transaction.previousQuantity}</td>
                        <td data-label="New stock">{transaction.newQuantity}</td>
                        <td data-label="Performed by">{transaction.performedByName || transaction.performedBy?.name || "Legacy record"}</td>
                        <td data-label="Note">{transaction.note || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pagedTransactions.page} pageCount={pagedTransactions.pageCount} total={transactions.length} itemName="transactions" label="Inventory history" onPageChange={setTransactionPage} />
              </>
            )}
          </section>}

          {isInsightsPage && <section className="insights-banner">
            <div className="insight-mark"><Icon name="sparkle" size={23} /></div>
            <div className="insights-banner-copy">
              <p className="eyebrow">INVENTORY HEALTH</p>
              <h2>Current stock recommendations</h2>
              <p>Recommendations are based on your inventory thresholds and recorded stock movement.</p>
            </div>
          </section>
          }

          {isInsightsPage && <section className="content-card insights-card">
            <div className="section-heading">
              <div><p className="eyebrow">RECOMMENDATIONS</p><h2>Needs attention</h2><p>Current stock compared with your product thresholds.</p></div>
              <span className="subtle-count">{inventoryInsights.length} {inventoryInsights.length === 1 ? "alert" : "alerts"}</span>
            </div>
            {productsLoading && products.length === 0 ? (
              <div className="insight-skeletons">{Array.from({ length: 2 }, (_, index) => <Skeleton className="skeleton-insight" key={index} />)}</div>
            ) : inventoryInsights.length === 0 ? (
              <div className="healthy-state"><span className="healthy-icon"><Icon name="check" size={18} /></span><span><strong>Inventory is in a healthy range</strong><small>No products are currently at or below their low-stock thresholds.</small></span></div>
            ) : (
              <div className="insight-list">
                {inventoryInsights.map((insight) => (
                  <article className={`insight-row ${insight.isOutOfStock ? "insight-row-danger" : ""}`} key={insight._id}>
                    <span className={`alert-icon ${insight.isOutOfStock ? "alert-icon-danger" : "alert-icon-warning"}`}><Icon name="warning" size={17} /></span>
                    <div className="insight-row-copy"><span className="status-badge">{insight.isOutOfStock ? "Out of stock" : "Low stock"}</span><strong>{insight.name}</strong><small>Current stock {insight.quantity} · Threshold {insight.lowStockThreshold}</small></div>
                    <div className="insight-action-copy"><span>{insight.recommendation}</span><strong>Suggested reorder: {insight.recommendedReorder} units</strong></div>
                    <button className="text-button" onClick={() => openStockAction(insight, "IN")}>Stock in</button>
                  </article>
                ))}
              </div>
            )}
          </section>}

          {isInsightsPage && <section className="content-card intelligence-card" aria-labelledby="inventory-intelligence-title">
            <div className="section-heading">
              <div><p className="eyebrow">INVENTORY DECISION ENGINE</p><h2 id="inventory-intelligence-title">Inventory Intelligence</h2><p>Clear, explainable recommendations from recorded stock-outs and supplier lead times.</p></div>
              <button className="secondary-button" type="button" onClick={fetchInventoryDecisions} disabled={decisionLoading}>
                <Icon name="refresh" size={16} /> {decisionLoading ? "Analyzing..." : "Refresh analysis"}
              </button>
            </div>

            {decisionError && (
              <div className="inline-error" role="alert">
                <Icon name="warning" size={17} /><span>Unable to load inventory intelligence.</span>
                <button className="text-button" type="button" onClick={fetchInventoryDecisions}>Retry</button>
              </div>
            )}

            {decisionLoading && inventoryDecisions.length === 0 ? (
              <div className="decision-loading" role="status" aria-live="polite"><span className="decision-spinner" aria-hidden="true" />Analyzing inventory...</div>
            ) : decisionError && inventoryDecisions.length === 0 ? (
              <div className="decision-empty decision-error-empty"><span className="empty-icon"><Icon name="warning" size={22} /></span><strong>Unable to load inventory intelligence.</strong><button className="text-button" type="button" onClick={fetchInventoryDecisions}>Try again</button></div>
            ) : !decisionError && inventoryDecisions.length === 0 ? (
              <div className="decision-empty"><span className="empty-icon"><Icon name="chart" size={22} /></span><strong>No inventory decisions available yet.</strong><span>Add products to your inventory to begin.</span></div>
            ) : (
              <>
                {decisionSummary && <div className="decision-summary-grid" aria-label="Inventory decision summary">
                  <div className="decision-summary-item"><span>Total products</span><strong>{decisionSummary.totalProducts}</strong></div>
                  <div className="decision-summary-item summary-now"><span>Reorder now</span><strong>{decisionSummary.reorderNow}</strong></div>
                  <div className="decision-summary-item summary-soon"><span>Reorder soon</span><strong>{decisionSummary.reorderSoon}</strong></div>
                  <div className="decision-summary-item summary-risk"><span>High risk</span><strong>{highRiskDecisionCount}</strong></div>
                </div>}

                {inventoryDecisions.some((decision) => decision.action === "INSUFFICIENT_DATA" || decision.recommendedOrderQuantity === null) && (
                  <p className="decision-data-note">Reliable demand-based recommendations need at least three recorded stock-out transactions and a known supplier lead time. Record stock movement and set the lead time when available.</p>
                )}

                <div className="decision-list">
                  {pagedDecisions.items.map((decision) => {
                    const actionClass = decision.action.toLowerCase().replaceAll("_", "-");
                    const riskClass = decision.risk.toLowerCase();
                    return (
                      <article className={`decision-card decision-${actionClass}`} key={decision.productId}>
                        <div className="decision-card-heading">
                          <div className="decision-product-title"><h3>{decision.name}</h3><span className={`decision-action-badge action-${actionClass}`}>{decision.action.replaceAll("_", " ")}</span></div>
                          <span className={`decision-risk risk-${riskClass}`}><span aria-hidden="true" />{decision.risk} RISK</span>
                        </div>
                        <div className="decision-highlights">
                          <div><span>Current stock</span><strong>{formatDecisionValue(decision.currentStock, " units")}</strong></div>
                          <div><span>Reorder point</span><strong>{formatDecisionValue(decision.reorderPoint, " units")}</strong></div>
                          <div><span>Est. stockout</span><strong>{formatDecisionValue(decision.estimatedDaysUntilStockout, " days")}</strong></div>
                        </div>
                        <div className="decision-order"><div><span>Recommended order</span><strong>{decision.recommendedOrderQuantity === null ? "Order quantity unavailable" : `${formatDecisionValue(decision.recommendedOrderQuantity, " units")}`}</strong></div><small>{decision.targetStockLevel === null ? "Set lead time and record stock-out history to calculate order size." : `Target stock level: ${formatDecisionValue(decision.targetStockLevel, " units")}`}</small></div>
                        {decision.action === "INSUFFICIENT_DATA" && <p className="decision-insufficient-note">Insufficient data for a reliable demand-based recommendation.</p>}
                        <div className="decision-explanation"><strong>Why this recommendation?</strong><p>{decision.explanation}</p></div>
                        <details className="decision-details">
                          <summary>View detailed calculations</summary>
                          <dl>
                            <div><dt>Average daily demand</dt><dd>{formatDecisionValue(decision.averageDailyDemand, " units/day")}</dd></div>
                            <div><dt>Average per OUT transaction</dt><dd>{formatDecisionValue(decision.averageDemandPerTransaction, " units")}</dd></div>
                            <div><dt>Supplier lead time</dt><dd>{formatDecisionValue(decision.supplierLeadTimeDays, " days")}</dd></div>
                            <div><dt>Safety stock</dt><dd>{formatDecisionValue(decision.safetyStock, " units")}</dd></div>
                            <div><dt>Expected lead-time demand</dt><dd>{formatDecisionValue(decision.expectedLeadTimeDemand, " units")}</dd></div>
                            <div><dt>OUT transactions used</dt><dd>{decision.demandTransactionsUsed} of {decision.outTransactionCount}</dd></div>
                            <div><dt>Demand window</dt><dd>{decision.demandWindow === "RECENT_90_DAYS" ? "Recent 90 days" : "All available history"}</dd></div>
                          </dl>
                        </details>
                      </article>
                    );
                  })}
                </div>
                <Pagination page={pagedDecisions.page} pageCount={pagedDecisions.pageCount} total={inventoryDecisions.length} itemName="decisions" label="Inventory decisions" onPageChange={setDecisionPage} />
              </>
            )}
          </section>}

          {isSimulatorPage && <section className="content-card simulator-card" aria-labelledby="simulator-title">
            <div className="section-heading">
              <div><p className="eyebrow">HYPOTHETICAL PLANNING</p><h2 id="simulator-title">Scenario setup</h2><p>Change demand or supplier timing to see how one product’s inventory risk may shift.</p></div>
            </div>

            <form className="simulator-form" onSubmit={runInventorySimulation}>
              <label className="form-field simulator-product-field"><span>Product</span>
                <select value={simulationForm.productId} onChange={(event) => updateSimulationForm({ productId: event.target.value })} required disabled={productsLoading || products.length === 0 || simulationLoading}>
                  <option value="">{productsLoading ? "Loading products..." : products.length ? "Choose a product" : "No visible products"}</option>
                  {products.map((product) => <option key={product._id} value={product._id}>{product.name} · {product.quantity} units in Main Inventory</option>)}
                </select>
                {selectedSimulatorProduct && <small>Current Main Inventory: {selectedSimulatorProduct.quantity} units · Current supplier lead time: {formatDecisionValue(selectedSimulatorProduct.supplierLeadTimeDays, " days")}</small>}
              </label>

              <label className="form-field simulator-demand-field"><span>Demand change <output htmlFor="simulator-demand">{simulationForm.demandChangePercent > 0 ? "+" : ""}{simulationForm.demandChangePercent}%</output></span>
                <input id="simulator-demand" type="range" min="-50" max="100" step="5" value={simulationForm.demandChangePercent} onChange={(event) => updateSimulationForm({ demandChangePercent: Number(event.target.value) })} aria-describedby="simulator-demand-help" disabled={simulationLoading} />
                <span className="simulator-range-labels"><small>−50%</small><small>No change</small><small>+100%</small></span>
                <small id="simulator-demand-help">Adjust the historical average daily demand up or down.</small>
              </label>

              <label className="form-field simulator-delay-field"><span>Supplier delay <small>(days)</small></span><input type="number" min="0" max="365" step="1" value={simulationForm.leadTimeChangeDays} onChange={(event) => updateSimulationForm({ leadTimeChangeDays: event.target.value })} disabled={simulationLoading} /><small>Additional days beyond the product’s saved lead time.</small></label>
              <div className="simulator-form-actions">
                <button className="secondary-button" type="button" onClick={resetSimulationScenario} disabled={simulationLoading || (simulationForm.demandChangePercent === 0 && simulationForm.leadTimeChangeDays === "0" && !simulationResult && !simulationError)}>Reset scenario</button>
                <button className="primary-button" type="submit" disabled={simulationLoading || !simulationForm.productId}>{simulationLoading ? "Simulating..." : "Run simulation"}</button>
              </div>
            </form>

            {simulationError && <div className="inline-error" role="alert"><Icon name="warning" size={17} /><span>{simulationError}</span></div>}
            {!simulationResult && !simulationLoading && !simulationError && <div className="simulator-placeholder"><Icon name="activity" size={19} /><span>Choose a product and adjust the scenario to compare current and simulated inventory risk.</span></div>}
            {simulationLoading && <div className="decision-loading" role="status" aria-live="polite"><span className="decision-spinner" aria-hidden="true" />Calculating this scenario from recorded inventory history...</div>}

            {simulationResult && <div className="simulation-results" aria-live="polite">
              <div className="simulation-result-heading"><div><p className="eyebrow">SIMULATION RESULTS</p><h3>{simulationResult.product.name}</h3></div><p>Hypothetical only · real stock and transactions are unchanged</p></div>
              <div className="simulation-stock-callout"><span>Current stock stays the same in both views</span><strong>{formatDecisionValue(simulationResult.current.currentStock, " units")}</strong></div>
              <div className="simulation-comparison">
                {[
                  { label: "Current", data: simulationResult.current },
                  { label: "Simulated scenario", data: simulationResult.simulated }
                ].map(({ label, data }, index) => {
                  const actionClass = data.action.toLowerCase().replaceAll("_", "-");
                  const riskClass = data.risk.toLowerCase();
                  const stockoutText = data.estimatedDaysUntilStockout === null
                    ? data.averageDailyDemand === 0 && data.risk !== "UNKNOWN" ? "Not projected (0 demand)" : "Not estimated"
                    : data.estimatedDaysUntilStockout === 0
                      ? "Now"
                      : `${formatDecisionValue(data.estimatedDaysUntilStockout, " days")} · ${new Date(data.estimatedStockoutDate).toLocaleDateString()}`;
                  return <article className={`simulation-column ${index === 1 ? "simulation-column-after" : ""}`} key={label}>
                    <h4>{label}</h4>
                    <dl>
                      <div><dt>Demand</dt><dd>{formatDecisionValue(data.averageDailyDemand, " units/day")}</dd></div>
                      <div><dt>Supplier lead time</dt><dd>{formatDecisionValue(data.supplierLeadTimeDays, " days")}</dd></div>
                      <div><dt>Estimated stockout</dt><dd>{stockoutText}</dd></div>
                      <div><dt>Reorder point</dt><dd>{formatDecisionValue(data.reorderPoint, " units")}</dd></div>
                      <div><dt>Risk</dt><dd><span className={`decision-risk risk-${riskClass}`}><span aria-hidden="true" />{data.risk}</span></dd></div>
                      <div><dt>Recommended action</dt><dd><span className={`decision-action-badge action-${actionClass}`}>{data.action.replaceAll("_", " ")}</span></dd></div>
                      <div><dt>Recommended order</dt><dd>{data.recommendedOrderQuantity === null ? "Unavailable" : formatDecisionValue(data.recommendedOrderQuantity, " units")}</dd></div>
                    </dl>
                  </article>;
                })}
              </div>
              <div className="simulation-explanation"><strong>Why did the risk change?</strong><p>{simulationResult.explanation}</p></div>
            </div>}
          </section>}

          {isInsightsPage && <section className="content-card forecast-card">
            <div className="section-heading">
              <div><p className="eyebrow">HISTORICAL STOCK-OUT ANALYSIS</p><h2>Demand forecast</h2><p>A basic demand-based recommendation from recorded transactions—not machine learning.</p></div>
              <button className="secondary-button" onClick={fetchForecast} disabled={forecastLoading}>
                <Icon name="refresh" size={16} /> {forecastLoading ? "Refreshing..." : "Refresh forecast"}
              </button>
            </div>
            {forecastError && <div className="inline-error" role="alert"><Icon name="warning" size={17} /><span>{forecastError}</span><button className="text-button" onClick={fetchForecast}>Retry</button></div>}
            {forecastLoading && forecasts.length === 0 ? (
              <div className="table-skeleton" aria-label="Loading demand forecast">{Array.from({ length: 3 }, (_, index) => <Skeleton className="skeleton-row" key={index} />)}</div>
            ) : forecastError && forecasts.length === 0 ? (
              <div className="empty-state compact-empty"><h3>Forecast unavailable</h3><p>Retry to fetch the latest transaction-based recommendations.</p><button className="text-button" onClick={fetchForecast}>Retry forecast</button></div>
            ) : forecasts.length === 0 ? (
              <div className="empty-state compact-empty"><span className="empty-icon"><Icon name="chart" size={22} /></span><h3>No products to forecast</h3><p>Add a product, then record stock movement to build demand history.</p></div>
            ) : (
              <>
              <div className="table-scroll" role="region" aria-label="Demand forecast table" tabIndex="0">
                <table className="data-table forecast-table">
                  <thead><tr><th>Product</th><th>Current stock</th><th>Historical demand</th><th>Average demand</th><th>Recommended reorder</th><th>Status</th></tr></thead>
                  <tbody>
                    {pagedForecasts.items.map((forecast) => {
                      const hasEnoughHistory = forecast.status !== "Insufficient Data";
                      return (
                        <tr key={forecast.productId}>
                          <td data-label="Product"><strong>{forecast.productName}</strong>
                            {hasEnoughHistory ? <small className="cell-note">Recent {forecast.recentTransactionCount} stock-outs: {forecast.recentDemand} units</small> : <small className="cell-note">Record more stock-out transactions to generate a demand recommendation.</small>}
                          </td>
                          <td data-label="Current stock">{forecast.currentStock} units</td>
                          <td data-label="Historical demand">{forecast.totalDemand} units <small className="cell-note">{forecast.transactionCount} stock-out {forecast.transactionCount === 1 ? "transaction" : "transactions"}</small></td>
                          <td data-label="Average demand">{forecast.averageDemand === null ? "—" : `${formatDemand(forecast.averageDemand)} units / transaction`}</td>
                          <td data-label="Recommended reorder">{forecast.recommendedReorder === null ? "—" : `${formatDemand(forecast.recommendedReorder)} units`}</td>
                          <td data-label="Status"><span className={`forecast-status ${getForecastStatusClass(forecast.status)}`}>{hasEnoughHistory ? forecast.status : "Insufficient historical data"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={pagedForecasts.page} pageCount={pagedForecasts.pageCount} total={forecasts.length} itemName="forecasts" label="Demand forecasts" onPageChange={setForecastPage} />
              </>
            )}
            <p className="formula-note">Reorder target = max(2 × low-stock threshold, 3 × average stock-out quantity). Forecasts require at least 3 stock-out transactions.</p>
          </section>}

          {isInsightsPage && <section className="content-card anomaly-section" aria-labelledby="anomaly-section-title">
            <div className="section-heading anomaly-heading">
              <div><p className="eyebrow">HISTORICAL MOVEMENT REVIEW</p><h2 id="anomaly-section-title">Anomaly Detection</h2><p>Explainable rules compare recent stock movements with each product’s recorded history.</p></div>
              <button className="secondary-button" type="button" onClick={fetchAnomalies} disabled={anomalyLoading}><Icon name="refresh" size={16} />{anomalyLoading ? "Analyzing..." : "Refresh analysis"}</button>
            </div>

            {anomalySummary && <div className="anomaly-summary-grid" aria-label="Anomaly summary">
              <article><span>Total anomalies</span><strong>{anomalySummary.totalAnomalies}</strong></article>
              <article className="anomaly-summary-high"><span>High risk</span><strong>{anomalySummary.highCount}</strong></article>
              <article className="anomaly-summary-medium"><span>Medium</span><strong>{anomalySummary.mediumCount}</strong></article>
              <article><span>Low</span><strong>{anomalySummary.lowCount}</strong></article>
            </div>}

            {anomalyError && <div className="inline-error" role="alert"><Icon name="warning" size={17} /><span>{anomalyError}</span><button className="text-button" type="button" onClick={fetchAnomalies}>Retry</button></div>}
            {anomalyLoading && anomalies.length === 0 ? <div className="table-skeleton" aria-label="Analyzing transaction history">{Array.from({ length: 3 }, (_, index) => <Skeleton className="skeleton-row" key={index} />)}</div>
              : !anomalyError && anomalies.length === 0 ? <div className="anomaly-empty-state"><span className="empty-icon"><Icon name="check" size={22} /></span><h3>No unusual inventory activity detected.</h3><p>Results are calculated from real stock IN/OUT transactions. New activity appears after refreshing the analysis.</p></div>
                : anomalies.length > 0 && <>
                  <div className="anomaly-filter-toolbar" aria-label="Filter anomalies">
                    <label><span>Severity</span><select value={anomalySeverityFilter} onChange={(event) => { setAnomalySeverityFilter(event.target.value); setAnomalyPage(1); }}><option value="all">All severity</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
                    <label><span>Anomaly type</span><select value={anomalyTypeFilter} onChange={(event) => { setAnomalyTypeFilter(event.target.value); setAnomalyPage(1); }}><option value="all">All types</option>{anomalyTypes.map((type) => <option value={type} key={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
                  </div>
                  {visibleAnomalies.length === 0 ? <div className="anomaly-empty-state"><h3>No anomalies match these filters.</h3><button type="button" className="text-button" onClick={() => { setAnomalySeverityFilter("all"); setAnomalyTypeFilter("all"); setAnomalyPage(1); }}>Clear filters</button></div> : <>
                    <div className="anomaly-list" role="list" aria-label="Detected inventory anomalies">
                      {pagedAnomalies.items.map((anomaly) => <button type="button" className="anomaly-card" role="listitem" key={anomaly.id} onClick={() => setSelectedAnomaly(anomaly)}>
                        <div className="anomaly-card-heading"><span className="anomaly-product-name">{anomaly.product.name}</span><span className={`anomaly-severity severity-${anomaly.severity.toLowerCase()}`}>{anomaly.severity}</span></div>
                        <div className="anomaly-card-metrics">
                          <span><small>Type</small><strong>{anomaly.anomalyType.replaceAll("_", " ")}</strong></span>
                          <span><small>Observed</small><strong>{formatDemand(anomaly.observedValue)} {anomaly.unit}</strong></span>
                          <span><small>Baseline</small><strong>{formatDemand(anomaly.baselineValue)} {anomaly.unit}</strong></span>
                          <span><small>Deviation</small><strong>{anomaly.deviation ? `+${anomaly.deviation.percent}%` : "—"}</strong></span>
                          <span><small>Detected</small><strong>{new Date(anomaly.detectedAt).toLocaleDateString()}</strong></span>
                        </div>
                        <p>{anomaly.explanation}</p>
                        <span className="anomaly-details-hint">View evidence and baseline <Icon name="chevron" size={14} /></span>
                      </button>)}
                    </div>
                    <Pagination page={pagedAnomalies.page} pageCount={pagedAnomalies.pageCount} total={visibleAnomalies.length} itemName="anomalies" label="Inventory anomalies" onPageChange={setAnomalyPage} />
                  </>}
                </>}
            {insufficientAnomalyProducts.length > 0 && <details className="anomaly-insufficient-note"><summary>Insufficient data for {insufficientAnomalyProducts.length} {insufficientAnomalyProducts.length === 1 ? "product" : "products"}</summary><p>At least 3 relevant stock IN/OUT transactions are required. No baseline is estimated for:</p><ul>{insufficientAnomalyProducts.map((item) => <li key={item.product.id}>{item.product.name}: {item.message}</li>)}</ul></details>}
          </section>}

          <footer className="page-footer"><span>StockSutra Inventory Intelligence · From Stock Tracking to Smart Decisions</span><span>Recommendations use your recorded inventory data.</span></footer>
        </main>
      </div>

      {selectedProduct && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProduct(null); }}>
          <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="product-details-title">
            <div className="modal-heading"><div><p className="eyebrow">PRODUCT DETAILS</p><h2 id="product-details-title">{selectedProduct.product.name}</h2></div><button className="icon-button" onClick={() => setSelectedProduct(null)} aria-label="Close product details"><Icon name="close" /></button></div>
            <div className="product-detail-layout">
              <div className="product-detail-image">{selectedProduct.product.image ? <img src={`${API_ORIGIN}${selectedProduct.product.image}`} alt={selectedProduct.product.name} /> : <span className="product-avatar"><Icon name="package" size={34} /></span>}</div>
              <dl className="product-detail-grid">
                <div><dt>Category</dt><dd>{selectedProduct.product.category}</dd></div>
                <div><dt>Main Inventory</dt><dd>{selectedProduct.product.quantity.toLocaleString()} units</dd></div>
                <div><dt>Total held inventory</dt><dd>{(selectedProduct.product.quantity + selectedProductDistributedQuantity).toLocaleString()} units</dd></div>
                <div><dt>Assigned Inventory</dt><dd>{selectedProductDistributedQuantity.toLocaleString()} units</dd></div>
                <div><dt>Unit price</dt><dd>₹{selectedProduct.product.price.toLocaleString()}</dd></div>
                <div><dt>Main inventory value</dt><dd>₹{(selectedProduct.product.quantity * selectedProduct.product.price).toLocaleString()}</dd></div>
                <div><dt>Supplier</dt><dd>{selectedProduct.product.supplier || "Not set"}</dd></div>
                <div><dt>Stock status</dt><dd>{selectedProduct.product.quantity === 0 ? "Out of stock" : selectedProduct.product.quantity <= selectedProduct.product.lowStockThreshold ? "Low stock" : "In stock"}</dd></div>
                <div><dt>Low-stock threshold</dt><dd>{selectedProduct.product.lowStockThreshold} units</dd></div>
                <div><dt>Assigned to</dt><dd>{selectedProduct.product.assignedTo?.name || "Unassigned"}</dd></div>
              </dl>
            </div>
            <div className="product-detail-activity distribution-detail">
              <div className="distribution-detail-heading"><div><h3>Assigned Inventory</h3><p>Member-held quantities are separate from Main Inventory.</p></div></div>
              {selectedProductDistributions.length === 0 ? <p>No stock currently assigned to team members.</p> : <>
                {pagedProductDistributions.items.map((allocation) => {
                const recipient = allocation.user;
                const recipientId = String(recipient?._id || recipient);
                const recipientName = recipient?.name || "Team member";
                return <div className="distribution-row" key={recipientId}><span><strong>{recipientName}</strong><small>{recipient?.role ? `${recipient.role[0].toUpperCase()}${recipient.role.slice(1)}${recipient?.status === "inactive" ? " · inactive" : ""}` : recipient?.status === "inactive" ? "Inactive member" : "Team member"}</small></span><strong>{allocation.quantity.toLocaleString()} units</strong>{canManageProducts && <button className="text-button" onClick={() => openTransferAction(selectedProduct.product, "RETURN", recipientId)}>Return stock</button>}</div>;
                })}
                <Pagination page={pagedProductDistributions.page} pageCount={pagedProductDistributions.pageCount} total={selectedProductDistributions.length} itemName="members" label="Assigned inventory" onPageChange={setProductDistributionPage} />
                <div className="distribution-total"><span>Total assigned</span><strong>{selectedProductDistributedQuantity.toLocaleString()} units</strong></div>
                <p className="distribution-total-note">Main Inventory + Assigned Inventory = Total held inventory.</p>
              </>}
            </div>
            <div className="product-detail-activity"><h3>Recent stock activity</h3>{productDetailsLoading ? <p>Loading recent activity…</p> : selectedProduct.error ? <p role="alert">{selectedProduct.error}</p> : selectedProduct.recentActivity.length === 0 ? <p>No stock activity recorded yet.</p> : selectedProduct.recentActivity.map((activity) => <div className="product-activity-row" key={activity._id}><strong>{activity.type === "IN" ? "Stock in" : activity.type === "OUT" ? "Stock out" : activity.type === "RETURN" ? "Stock returned" : "Stock transferred"} · {activity.quantity} units</strong><span>{activity.sourceLocation ? `${activity.sourceLocation} → ${activity.destinationLocation} · ` : ""}{activity.performedByName || activity.performedBy?.name || "Legacy record"} · {new Date(activity.createdAt).toLocaleDateString()}</span></div>)}</div>
            {selectedProduct.assignmentHistory?.length > 0 && <div className="product-detail-activity"><h3>Assignment history</h3>{selectedProduct.assignmentHistory.map((assignment) => <div className="product-activity-row" key={assignment._id}><strong>{assignment.previousAssignee?.name || "Unassigned"} → {assignment.assignedTo?.name || "Unassigned"}</strong><span>Changed by {assignment.changedByName} · {new Date(assignment.createdAt).toLocaleDateString()}</span></div>)}</div>}
            <div className="modal-actions"><button className="secondary-button" onClick={() => { setSelectedProduct(null); openStockAction(selectedProduct.product, "IN"); }}>Stock in</button>{canManageProducts && <><button className="secondary-button" onClick={() => openTransferAction(selectedProduct.product)}>Distribute stock</button><button className="primary-button" onClick={() => { setSelectedProduct(null); handleEdit(selectedProduct.product); }}>Edit product</button></>}</div>
          </section>
        </div>
      )}

      {selectedDeadStock && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDeadStock(null); }}>
          <section className="details-modal dead-stock-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dead-stock-detail-title">
            <div className="modal-heading"><div><p className="eyebrow">DEAD-STOCK ANALYSIS</p><h2 id="dead-stock-detail-title">{selectedDeadStock.name}</h2></div><button className="icon-button" type="button" onClick={() => setSelectedDeadStock(null)} aria-label="Close dead-stock analysis"><Icon name="close" /></button></div>
            <div className="dead-stock-detail-badges"><span className={`dead-stock-badge dead-stock-${selectedDeadStock.severity.toLowerCase()}`}>{selectedDeadStock.severity}</span><span>{selectedDeadStock.status.replaceAll("_", " ")}</span><span>Recommended action: {selectedDeadStock.recommendedAction.replaceAll("_", " ")}</span></div>
            <p className="dead-stock-explanation">{selectedDeadStock.explanation}</p>
            <dl className="anomaly-detail-metrics"><div><dt>Current stock</dt><dd>{selectedDeadStock.currentStock.toLocaleString()} units</dd></div><div><dt>Last movement</dt><dd>{selectedDeadStock.lastMovementAt ? `${selectedDeadStock.daysSinceLastMovement} days ago` : "No movement history"}</dd></div><div><dt>Stock out, last 90 days</dt><dd>{selectedDeadStock.outQuantity90Days.toLocaleString()} units</dd></div><div><dt>Stock-out records</dt><dd>{selectedDeadStock.stockOutTransactionCount}</dd></div><div><dt>Average daily demand</dt><dd>{selectedDeadStock.averageDailyOutDemand == null ? "Insufficient data" : `${selectedDeadStock.averageDailyOutDemand} units/day`}</dd></div><div><dt>Stock coverage</dt><dd>{selectedDeadStock.daysOfStockCoverage == null ? "—" : `${selectedDeadStock.daysOfStockCoverage} days`}</dd></div><div><dt>Estimated value</dt><dd>{selectedDeadStock.estimatedTiedUpValue == null ? "Unavailable" : `₹${Number(selectedDeadStock.estimatedTiedUpValue).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}</dd></div></dl>
            <p className="dead-stock-data-note">This analysis is read-only. Value estimates use the product’s saved unit price and are not an accounting valuation.</p>
          </section>
        </div>
      )}

      {selectedAnomaly && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAnomaly(null); }}>
          <section className="details-modal anomaly-detail-modal" role="dialog" aria-modal="true" aria-labelledby="anomaly-detail-title">
            <div className="modal-heading"><div><p className="eyebrow">INVENTORY ANOMALY EVIDENCE</p><h2 id="anomaly-detail-title">{selectedAnomaly.product.name}</h2></div><button className="icon-button" type="button" onClick={() => setSelectedAnomaly(null)} aria-label="Close anomaly details"><Icon name="close" /></button></div>
            <div className="anomaly-detail-badges"><span>{selectedAnomaly.anomalyType.replaceAll("_", " ")}</span><span className={`anomaly-severity severity-${selectedAnomaly.severity.toLowerCase()}`}>{selectedAnomaly.severity}</span></div>
            <p className="anomaly-detail-explanation">{selectedAnomaly.explanation}</p>
            <dl className="anomaly-detail-metrics"><div><dt>Observed</dt><dd>{formatDemand(selectedAnomaly.observedValue)} {selectedAnomaly.unit}</dd></div><div><dt>Historical baseline</dt><dd>{formatDemand(selectedAnomaly.baselineValue)} {selectedAnomaly.unit}</dd></div><div><dt>Deviation</dt><dd>{selectedAnomaly.deviation ? `+${selectedAnomaly.deviation.percent}% (${selectedAnomaly.deviation.multiplier}×)` : "—"}</dd></div><div><dt>Comparison window</dt><dd>{selectedAnomaly.window}</dd></div></dl>
            <div className="anomaly-evidence-list"><h3>Relevant transactions</h3>{selectedAnomaly.relatedTransactions.length === 0 ? <p>No transaction evidence was returned.</p> : selectedAnomaly.relatedTransactions.map((transaction) => <div className="anomaly-evidence-row" key={transaction.id}><span><strong>Stock {transaction.type}</strong><small>{new Date(transaction.detectedAt).toLocaleString()}</small></span><strong>{transaction.quantity} units</strong><span>Stock {transaction.previousQuantity ?? "—"} → {transaction.newQuantity ?? "—"}</span>{transaction.note && <small>{transaction.note}</small>}</div>)}</div>
          </section>
        </div>
      )}

      {selectedMember && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMember(null); }}>
          <section className="details-modal member-details-modal" role="dialog" aria-modal="true" aria-labelledby="member-details-title">
            <div className="modal-heading"><div><p className="eyebrow">TEAM MEMBER</p><h2 id="member-details-title">{selectedMember.name}</h2></div><button className="icon-button" onClick={() => setSelectedMember(null)} aria-label="Close member details"><Icon name="close" /></button></div>
            <dl className="product-detail-grid"><div><dt>Email</dt><dd>{selectedMember.email}</dd></div><div><dt>Role</dt><dd>{selectedMember.role}</dd></div><div><dt>Status</dt><dd>{selectedMember.status}</dd></div><div><dt>Joined</dt><dd>{new Date(selectedMember.createdAt).toLocaleDateString()}</dd></div><div><dt>Assigned products</dt><dd>{products.filter((product) => String(product.assignedTo?._id || product.assignedTo) === selectedMember._id).length}</dd></div><div><dt>Recent stock operations</dt><dd>{transactions.filter((transaction) => String(transaction.performedBy?._id || transaction.performedBy) === selectedMember._id).length}</dd></div></dl>
            <div className="product-detail-activity"><h3>Assigned inventory</h3>{selectedMember.distributionVisible === false ? <p>Inventory allocation details are visible only to you.</p> : memberDistributedInventory.length === 0 ? <p>No inventory is currently distributed to this member.</p> : <><p>Total items: <strong>{selectedMember.distributedUnitCount} units</strong></p>{pagedMemberInventory.items.map((item) => <div className="product-activity-row" key={item.productId}><strong>{item.productName}</strong><span>{item.quantity} units</span></div>)}<Pagination page={pagedMemberInventory.page} pageCount={pagedMemberInventory.pageCount} total={memberDistributedInventory.length} itemName="products" label="Member assigned inventory" onPageChange={setMemberInventoryPage} /></>}</div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProductForm(); }}>
          <form className="product-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div className="modal-heading"><div><p className="eyebrow">PRODUCT DETAILS</p><h2 id="product-modal-title">{editingId ? "Edit product" : "Add a product"}</h2><p>Keep your catalog and stock information up to date.</p></div><button type="button" className="icon-button" onClick={closeProductForm} aria-label="Close product form"><Icon name="close" /></button></div>
            <div className="form-grid">
              <div className="image-upload-field">
                <span className="form-label">Product image <small>(optional · JPG, PNG, or WEBP · 5 MB max)</small></span>
                <div className={`image-upload-area ${imagePreview ? "has-image" : ""}`}>
                  {imagePreview ? <img src={imagePreview} alt="Product preview" className="product-image-preview" /> : <span className="upload-placeholder"><Icon name="package" size={24} /><strong>Choose a product image</strong><small>Preview before saving</small></span>}
                  <div className="image-upload-actions">
                    <label className="secondary-button image-choose-button">{imagePreview ? "Change image" : "Choose image"}<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleImageChange} /></label>
                    {imagePreview && <button type="button" className="text-button danger-text-button" onClick={handleRemoveImage}>Remove image</button>}
                  </div>
                  {imageFile && <small className="image-filename">{imageFile.name}</small>}
                </div>
              </div>
              <label className="form-field"><span>Product name</span><input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Wireless keyboard" required autoFocus /></label>
              <label className="form-field"><span>Category</span><input name="category" value={formData.category} onChange={handleChange} placeholder="e.g. Electronics" required /></label>
              <label className="form-field"><span>Quantity</span><input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min="0" placeholder="0" required /><small>Units currently available</small></label>
              <label className="form-field"><span>Unit price</span><input type="number" name="price" value={formData.price} onChange={handleChange} min="0" step="0.01" placeholder="0.00" required /></label>
              <label className="form-field"><span>Low-stock threshold</span><input type="number" name="lowStockThreshold" value={formData.lowStockThreshold} onChange={handleChange} min="0" required /><small>Alert when stock reaches this level</small></label>
              <label className="form-field"><span>Supplier <small>(optional)</small></span><input name="supplier" value={formData.supplier} onChange={handleChange} placeholder="e.g. Acme Supply Co." /></label>
              <label className="form-field"><span>Supplier lead time <small>(optional, in days)</small></span><input type="number" name="supplierLeadTimeDays" value={formData.supplierLeadTimeDays} onChange={handleChange} min="1" step="1" placeholder="Set when known" /><small>Used for reorder recommendations; leave blank if unknown.</small></label>
              <label className="form-field"><span>Assigned team member <small>(optional)</small></span><select name="assignedTo" value={formData.assignedTo} onChange={handleChange}><option value="">Unassigned</option>{teamMembers.filter((member) => member.status === "active").map((member) => <option key={member._id} value={member._id}>{member.name} · {member.role}</option>)}</select></label>
            </div>
            {productFormError && <p className="form-error" role="alert">{productFormError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeProductForm}>Cancel</button><button type="submit" className="primary-button">{editingId ? "Update product" : "Save product"}</button></div>
          </form>
        </div>
      )}

      {stockAction && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingStock) closeStockAction(); }}>
          <form className="stock-modal" onSubmit={handleStockSubmit} role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
            <div className="modal-heading"><div><p className="eyebrow">INVENTORY TRANSACTION</p><h2 id="stock-modal-title">{stockAction.type === "IN" ? "Stock in" : "Stock out"}</h2><p>Record a quantity change for this product.</p></div><button type="button" className="icon-button" onClick={closeStockAction} aria-label="Close stock form" disabled={savingStock}><Icon name="close" /></button></div>
            <div className="stock-summary"><span className="product-avatar">{stockAction.product.name.slice(0, 1).toUpperCase()}</span><span><strong>{stockAction.product.name}</strong><small>{stockAction.product.category}</small></span><span className="stock-current"><small>Current stock</small><strong>{stockAction.product.quantity}</strong></span></div>
            <label className="form-field"><span>{stockAction.type === "IN" ? "Quantity to add" : "Quantity to remove"}</span><input type="number" name="quantity" value={stockForm.quantity} onChange={handleStockFormChange} min="1" step="1" required autoFocus /><small>Enter a whole number greater than zero.</small></label>
            <label className="form-field note-field"><span>Note <small>(optional)</small></span><textarea name="note" value={stockForm.note} onChange={handleStockFormChange} placeholder={stockAction.type === "IN" ? "e.g. Supplier delivery" : "e.g. Customer order"} rows="3" /></label>
            {stockError && <p className="form-error" role="alert">{stockError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeStockAction} disabled={savingStock}>Cancel</button><button type="submit" className="primary-button" disabled={savingStock}>{savingStock ? "Saving..." : stockAction.type === "IN" ? "Confirm stock in" : "Confirm stock out"}</button></div>
          </form>
        </div>
      )}

      {transferAction && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingTransfer) closeTransferAction(); }}>
          <form className="stock-modal transfer-modal" onSubmit={handleTransferSubmit} role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">STOCK DISTRIBUTION</p><h2 id="transfer-modal-title">{transferAction.type === "RETURN" ? "Return stock" : "Distribute stock"}</h2><p>{transferAction.type === "RETURN" ? "Move allocated units back to Main Inventory." : "Allocate available units to a team member."}</p></div>
              <button type="button" className="icon-button" onClick={closeTransferAction} aria-label="Close stock distribution form" disabled={savingTransfer}><Icon name="close" /></button>
            </div>
            <div className="stock-summary"><span className="product-avatar">{transferAction.product.name.slice(0, 1).toUpperCase()}</span><span><strong>{transferAction.product.name}</strong><small>{transferAction.product.category}</small></span><span className="stock-current"><small>{transferAction.type === "RETURN" ? "Member allocation" : "Available"}</small><strong>{transferAction.type === "RETURN" ? selectedReturnAllocation?.quantity || 0 : transferAction.product.quantity}</strong></span></div>
            <label className="form-field"><span>{transferAction.type === "RETURN" ? "Return from" : "Assign to"}</span>
              <select name="recipientUserId" value={transferForm.recipientUserId} onChange={(event) => setTransferForm({ ...transferForm, recipientUserId: event.target.value, quantity: "" })} required>
                <option value="">Choose a team member</option>
                {transferAction.type === "RETURN"
                  ? (transferAction.product.distributions || []).filter((allocation) => allocation.quantity > 0).map((allocation) => {
                    const recipient = allocation.user;
                    const id = String(recipient?._id || recipient);
                    return <option key={id} value={id}>{recipient?.name || "Team member"} · {allocation.quantity} units held{recipient?.status === "inactive" ? " · inactive" : ""}</option>;
                  })
                  : activeTransferRecipients.map((member) => <option key={member._id} value={member._id}>{member.name} · {member.role}</option>)}
              </select>
            </label>
            <label className="form-field"><span>Quantity</span><input type="number" name="quantity" value={transferForm.quantity} onChange={(event) => setTransferForm({ ...transferForm, quantity: event.target.value })} min="1" max={transferAction.type === "RETURN" ? selectedReturnAllocation?.quantity || 1 : transferAction.product.quantity} step="1" required /><small>Enter a whole number. Available: {transferAction.type === "RETURN" ? selectedReturnAllocation?.quantity || 0 : transferAction.product.quantity} units.</small></label>
            <label className="form-field note-field"><span>Reason <small>(optional)</small></span><textarea name="note" value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} placeholder="e.g. Project allocation" rows="3" /></label>
            {transferAction.type === "TRANSFER" && activeTransferRecipients.length === 0 && <p className="form-error">No active team members are available to receive stock.</p>}
            {transferAction.type === "RETURN" && (transferAction.product.distributions || []).length === 0 && <p className="form-error">There is no distributed stock to return.</p>}
            {transferError && <p className="form-error" role="alert">{transferError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeTransferAction} disabled={savingTransfer}>Cancel</button><button type="submit" className="primary-button" disabled={savingTransfer || (transferAction.type === "TRANSFER" && activeTransferRecipients.length === 0)}>{savingTransfer ? "Saving..." : transferAction.type === "RETURN" ? "Return stock" : "Transfer stock"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        {Object.keys(pageCopy).map((path) => <Route path={path} element={<StockSutraLayout />} key={path} />)}
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
