import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { MenuProvider } from "./context/MenuContext.jsx";
import { RestaurantSettingsProvider } from "./context/RestaurantSettingsContext.jsx";
import "./style.css";
import "./cart.css";
import "./order-progress.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <RestaurantSettingsProvider><MenuProvider><CartProvider>
        <App />
      </CartProvider></MenuProvider></RestaurantSettingsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
