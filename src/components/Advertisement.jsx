export default function Advertisement({ onClose }) {
  return (
    <div className="advert-overlay" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="advert-popup" role="dialog" aria-modal="true" aria-label="Today's deal">
        <button className="advert-close" onClick={onClose} aria-label="Close deal">&times;</button>
        <img src="/images/kech food center advest.png" alt="Today's Kech Food Center deal" />
      </div>
    </div>
  );
}
