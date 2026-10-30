import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("cart") || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.flatMap((item) => {
      const productId = item?.productId || item?.id;
      const quantity = Number(item?.quantity);
      if (typeof productId !== "string" || !Number.isInteger(quantity) || quantity < 1) return [];
      return [{
        productId,
        id: productId,
        name: String(item.name || "Menu item"),
        image: String(item.image || ""),
        label: String(item.label || item.optionLabel || ""),
        price: Number(item.price) || 0,
        quantity: Math.min(quantity, 99),
      }];
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readCart);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const value = useMemo(() => {
    const count = items.reduce((total, item) => total + item.quantity, 0);
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);

    function addItem(product, option, quantity = 1) {
      const label = option?.label || "";
      const price = Number(option?.price ?? product.price);
      setItems((current) => {
        const matching = current.find((item) => item.productId === product.id && item.label === label);
        if (matching) {
          return current.map((item) => item === matching
            ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
            : item);
        }
        return [...current, {
          productId: product.id,
          id: product.id,
          name: product.name,
          image: product.image,
          price,
          label,
          quantity: Math.min(99, quantity),
        }];
      });
    }

    function changeQuantity(line, amount) {
      setItems((current) => current.flatMap((item) => {
        if (item.productId !== line.productId || item.label !== line.label) return [item];
        const quantity = item.quantity + amount;
        return quantity > 0 ? [{ ...item, quantity: Math.min(99, quantity) }] : [];
      }));
    }

    function removeItem(line) {
      setItems((current) => current.filter((item) => item.productId !== line.productId || item.label !== line.label));
    }

    return { items, count, subtotal, addItem, changeQuantity, removeItem, clear: () => setItems([]) };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside a CartProvider.");
  return context;
}
