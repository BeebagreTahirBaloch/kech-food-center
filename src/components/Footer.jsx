import { useRestaurantSettings } from '../context/RestaurantSettingsContext.jsx';

export default function Footer() {
  const { restaurantPhone } = useRestaurantSettings();
  return (
    <>
      <footer id="contact" className="main-footer">
        <div className="footer-box01"><h4>KECH FOOD CENTER</h4><p>Fresh meals, burgers, pizza and BBQ in Turbat.</p></div>
        <div className="footer-box02"><h4>Contact</h4><a href={`tel:${restaurantPhone}`}>Call us: {restaurantPhone}</a></div>
        <div className="footer-box03"><h4>Delivery</h4><p>Choose a delivery location and add your full address at checkout.</p></div>
        <div className="footer-social-media-handdle">
          <h5>Follow us</h5>
          <div className="logos" aria-label="Social media"><span><i className="ri-facebook-fill" /></span><span><i className="ri-instagram-line" /></span><span><i className="ri-twitter-x-line" /></span></div>
        </div>
      </footer>
      <div className="footer">
        <div className="footer-container"><div className="copyright">KECH FOOD CENTER. All rights reserved</div><div className="powered-by"><span>Powered By</span><a href="#contact">Beebagre Tahir Solutions</a></div></div>
      </div>
    </>
  );
}
