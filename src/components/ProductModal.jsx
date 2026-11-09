import { useEffect, useState } from "react";

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;
}

export default function ProductModal({ item, onClose, onAdd }) {
  const options = item.options || [];
  const [selectedOption, setSelectedOption] = useState(options[0] || null);
  const [quantity, setQuantity] = useState(1);
  const price = selectedOption?.price ?? item.price;

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="popup-overlay" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div id="pop-up" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <button className="popup-close-btn" onClick={onClose} aria-label="Close">&times;</button>
        <img className="popup-image" src={item.image} alt={item.name} />
        <h2 id="product-modal-title" className="popup-name">{item.name}</h2>
        <p className="popup-para">{item.desc}</p>
        {options.length > 0 ? (
          <div className="sizes-grid" aria-label="Choose size">
            {options.map((option) => (
              <button type="button" key={option.label} className={`popup-multi-button${selectedOption?.label === option.label ? " selected" : ""}`} onClick={() => setSelectedOption(option)}>
                {option.label}<p>{formatPrice(option.price)}</p>
              </button>
            ))}
          </div>
        ) : <h3 className="popup-price">{formatPrice(price)}</h3>}
        <div className="popup-bottom-bar">
          <div className="popup-qty-controls">
            <button className="popup-qty-decrease" onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">−</button>
            <span className="popup-qty-display">{quantity}</span>
            <button className="popup-qty-increase" onClick={() => setQuantity((current) => Math.min(20, current + 1))} aria-label="Increase quantity">+</button>
          </div>
          <button className="popup-add-btn" onClick={() => onAdd(item, selectedOption, quantity)}>Add to Cart · {formatPrice(price * quantity)}</button>
        </div>
      </div>
    </div>
  );
}
