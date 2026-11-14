import { defaultWebsiteImages, fallbackWebsiteImage } from '../lib/websiteImages.js';
export default function Advertisement({ onClose, image = defaultWebsiteImages.popup }) {
  return (
    <div className="advert-overlay" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="advert-popup" role="dialog" aria-modal="true" aria-label="Today's deal">
        <button className="advert-close" onClick={onClose} aria-label="Close deal">&times;</button>
        <img src={image} alt="Today's Kech Food Center deal" onError={e => fallbackWebsiteImage(e, 'popup')} />
      </div>
    </div>
  );
}
