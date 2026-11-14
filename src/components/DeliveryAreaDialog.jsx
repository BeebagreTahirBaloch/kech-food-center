import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function DeliveryAreaDialog({ message, onClose }) {
  const dialog = useRef(null);
  // Use the server's saved limit, never a hardcoded or browser-supplied radius.
  const radius = message?.match(/outside our (\d+(?:\.\d+)?) km delivery area/i)?.[1];

  useEffect(() => {
    if (!message) return;
    const element = dialog.current;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [message]);

  if (!message) return null;
  return createPortal(
    <dialog ref={dialog} className="delivery-area-dialog" aria-labelledby="delivery-area-dialog-title"
      aria-describedby="delivery-area-dialog-description" onCancel={event => { event.preventDefault(); onClose(); }}>
      <button type="button" className="delivery-area-close" aria-label="Close delivery area notice" onClick={onClose}>×</button>
      <span className="delivery-area-symbol" aria-hidden="true"><i className="ri-map-pin-range-line" /></span>
      <h2 id="delivery-area-dialog-title">Outside our delivery area</h2>
      <p id="delivery-area-dialog-description">{radius
        ? <>Sorry, we currently deliver within <strong>{radius} km of Kech Food Center</strong>. Please choose a closer delivery location to continue.</>
        : message}</p>
      <button type="button" className="delivery-area-choose" onClick={onClose} autoFocus>Choose another location</button>
    </dialog>, document.body,
  );
}
