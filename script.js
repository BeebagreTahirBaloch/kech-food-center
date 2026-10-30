// adivstment popup----------------------------------------///////////////
let advistementOverlay = document.querySelector(".advert-overlay")

window.onload = ()=>{
     advistementOverlay.style.display = "flex"
}

advistementOverlay.addEventListener("click",(event)=>{
    if(event.target === advistementOverlay ){ document.querySelector(".advert-overlay").style.display = "none"}
})

document.querySelector(".advert-close").addEventListener("click",()=>{
     document.querySelector(".advert-overlay").style.display = "none"

})
// --------------------
let cart = JSON.parse(localStorage.getItem('cart')) || [];
 
console.log(cart)

// ── Menu Data ─────────────────────────────────────────────────
const menuSection = [
  {
    id: "section-heading-pizza",
    title: "PIZZA PREMIUM",
    items: [
      {
        name: "Chicken Pizza",
        image: "./images/Sauce-Boss-50kb_variant_.jpg",
        desc: "Secret sauce base, mozzarella cheese, Tex Max",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 800,
        largePizzaPrice: 1200,
        extraLargePizza: 1800,
      },
      {
        name: "Fajita Pizza",
        image:
          "./images/CreamyTikka-HandTossedTopcopy_variant_0-2024-11-07073417.jpg",
        desc: "Cheese mayo base, mozzarella cheese, chicken",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 1000,
        largePizzaPrice: 1400,
        extraLargePizza: 2000,
      },
      {
        name: "BBQ Pizza",
        image:
          "./images/CreamyTikka-HandTossedTopcopy_variant_0-2024-11-07073417.jpg",
        desc: "BBQ sauce, cheese mayo base, mozzarella cheese, chicken",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 1000,
        largePizzaPrice: 1400,
        extraLargePizza: 2000,
      },
      {
        name: "Tikka Pizza",
        image: "./images/-ChickenTikka_4.jpg",
        desc: "Pizza sauce base, mozzarella cheese, chicken tikka chunks",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 1000,
        largePizzaPrice: 1400,
        extraLargePizza: 2000,
      },
      {
        name: "Vegetable Pizza",
        image:
          "./images/b2009180-9cda-11ef-bf94-4552bcb9a3dd-Veggie-HandTossedTopcopy_variant_0-2024-11-07073417.jpg",
        desc: "Pizza sauce base, mozzarella cheese, onions, green peppers..",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 1000,
        largePizzaPrice: 1400,
        extraLargePizza: 2000,
      },
      {
        name: "Malai Boti Pizza",
        image: "./images/pepperoni pizza.jpg",
        desc: "Pizza sauce base, mozzarella cheese, malai boti toppings",
        smallPizzaPrice: 500,
        mediumPizzaPrice: 1000,
        largePizzaPrice: 1400,
        extraLargePizza: 2000,
      },
    ],
  },
  {
    id: "section-heading-burger",
    title: "BURGERS",
    items: [
      {
        name: "Zinger Burger",
        image: "./images/Zinger-Burger2.png",
        desc: "Crispy Zinger fillet, signature mayo and lettuce",
        price: 500,
      },
      {
        name: "Cheese Zinger Burger",
        image: "./images/cheese zindger burger ok.png",
        desc: "Crispy Zinger fillet, signature mayo, cheese and lettuce",
        price: 600,
      },
      {
        name: "Chicken Burger",
        image: "./images/chicken burger.02png.jpg",
        desc: "Chicken fillet, spicy mayo, lettuce, sesame bun",
        price: 300,
      },
      {
        name: "KFC Special Burger",
        image: "./images/jumbo burger 5.jpg",
        desc: "2 breaded chicken patties, cheese, lettuce and special sauce",
        price: 500,
      },
      {
        name: "Jumbo Burger",
        image: "./images/jumbo burger.png",
        desc: "2 breaded chicken patties, cheese, lettuce and extra sauce",
        price: 700,
      },
    ],
  },
  {
    id: "section-heading-bbq",
    title: "BBQ PREMIUM",
    items: [
      {
        name: "Chicken Tikka Leg",
        image: "./images/chicken tikka bbq.jpg",
        desc: "Chicken leg piece, marinated with secret ingredients, tangy taste",
        price: 400,
      },
      {
        name: "Chicken Tikka Chest",
        image: "./images/Chicken-Chest-Piece-2.png.jpg",
        desc: "Chicken chest piece, marinated with secret ingredients, tangy taste",
        price: 500,
      },
      {
        name: "Malai Tikka Leg",
        image: "./images/CHICKEN-MALAI-TIKA-LEG.jpg",
        desc: "Chicken leg piece, marinated with yogurt and special ingredients",
        price: 550,
      },
      {
        name: "Malai Tikka Chest",
        image: "./images/CHICKEN-MALAI-TIKA-chestjpg.jpg",
        desc: "Chicken chest piece, marinated with yogurt and special ingredients",
        price: 650,
      },
      {
        name: "Malai Butti",
        image: "./images/malai buti bbq.jpg",
        desc: "Chicken pieces, marinated with yogurt and spices, rich taste",
        price: 500,
      },
      {
        name: "Chicken Butti",
        image: "./images/chicken butti bbq.jpg",
        desc: "Chicken pieces, marinated with secret ingredients, tangy taste",
        price: 400,
      },
    ],
  },
  {
    id: "section-heading-roll",
    title: "ROLLS PREMIUM",
    items: [
      {
        name: "Chicken Roll",
        image: "./images/chicken roll 2.jpg",
        desc: "Crispy chicken with sauce base and mozzarella cheese",
        price: 150,
      },
      {
        name: "Chicken Mayo Roll",
        image: "./images/mayo roll.jpg",
        desc: "Chicken filled with spicy chunks and special mayo",
        price: 250,
      },
      {
        name: "Zinger Roll",
        image: "./images/zinger roll.jpg",
        desc: "Zinger filled chicken with spicy chunks and sauce",
        price: 300,
      },
      {
        name: "Cheese Roll",
        image: "./images/chicken cheese roll.jpg",
        desc: "Sauce base, mozzarella cheese and chicken tikka chunks",
        price: 250,
      },
      {
        name: "Malai Butti Roll",
        image: "./images/chicken kabab roll.jpg",
        desc: "Malai butti with mozzarella cheese, onions and green peppers",
        price: 250,
      },
      {
        name: "Kabab Roll",
        image: "./images/Kabab roll.jpg",
        desc: "Perfectly grilled kabab with special chutney",
        price: 200,
      },
    ],
  },
  {
    id: "section-heading-fries",
    title: "FRIES",
    items: [
      {
        name: "Masala Fries",
        image: "./images/masala fries.jpg",
        desc: "Crispy fries tossed with KFC special masala",
        price: 100,
      },
      {
        name: "Mayo Fries",
        image: "./images/mayo garlic fries.jpg",
        desc: "Crispy fries with masala and special garlic mayo sauce",
        price: 150,
      },
      {
        name: "Cheese Fries",
        image: "./images/cheese fries.jpg",
        desc: "Fries loaded with chicken and melted cheese, baked in oven",
        price: 400,
      },
      {
        name: "Pizza Fries",
        image: "./images/pizza fries.jpg",
        desc: "Pizza style fries with sauce, olives and a generous amount of cheese",
        price: 450,
      },
    ],
  },
  {
    id: "section-heading-friedchicken",
    title: "FRIED CHICKEN",
    items: [
      {
        name: "Quarter Broast",
        image: "./images/Two-Piece-Broast-Chest-quarter.png",
        desc: "One chest plus one wing, fried to crisp perfection",
        price: 500,
      },
      {
        name: "Half Broast",
        image: "./images/half broast.png",
        desc: "Two chest pieces plus two wings, fried crisp and tender",
        price: 600,
      },
      {
        name: "Crispy Chicken Wings",
        image: "./images/fried chicken wings.png",
        desc: "Chicken wings marinated to taste, crispy and juicy",
        price: 550,
      },
    ],
  },
  {
    id: "section-heading-sandwich",
    title: "SANDWICHES",
    items: [
      {
        name: "Chicken Sandwich",
        image: "images/chicken sandwich.jpg",
        desc: "Grilled chicken, fresh lettuce and special sauce, all in one bite",
        price: 400,
      },
      {
        name: "Club Sandwich",
        image: "./images/club sandwich.jpg",
        desc: "Grilled chicken, fresh lettuce and cheese in a classic club style",
        price: 550,
      },
      {
        name: "Grilled Chicken Sandwich",
        image: "./images/grilled sandwich.jpg",
        desc: "Smoky BBQ sauce, grilled chicken fillet, toasted to perfection",
        price: 600,
      },
    ],
  },
  {
    id: "section-heading-breakfast",
    title: "BREAKFAST",
    items: [
      {
        name: "Omelette ",
        image: "./images/omelette roll.png",
        desc: "Freshly made omelette with vegetables, wrapped in love",
        price: 120,
      },
      {
        name: "Anda Paratha",
        image: "./images/anda paratha.jpg",
        desc: "Crispy paratha served with fried egg and chutney",
        price: 100,
      },
      {
        name: "Halwa Puri",
        image: "./images/halwa purii.jpg",
        desc: "Traditional halwa with crispy puris, a classic breakfast",
        price: 150,
      },
      {
        name: "Channa Paratha",
        image: "./images/channa paratha.jpg",
        desc: "Spicy channa curry served with fresh paratha",
        price: 130,
      },
      {
        name: "French Toast",
        image: "./images/french toast.jpg",
        desc: "Golden fried bread with honey and cream, sweet morning treat",
        price: 120,
      },
      {
        name: "Boiled Eggs",
        image: "./images/boiled eggs.jpg",
        desc: "Two perfectly boiled eggs served with salt and pepper",
        price: 80,
      },
      {
        name: "Lassi",
        image: "./images/lassi.jpg",
        desc: "Fresh sweet or salted lassi made with pure dahi",
        price: 100,
      },
      {
        name: "Chai",
        image: "./images/chai.jpg",
        desc: "Desi dhaba style chai, perfectly brewed with milk and spices",
        price: 50,
      },
    ],
  },
  {
    id: "section-heading-extra",
    title: "EXTRAS",
    items: [
      {
        name: "Cold Drinks",
        image: "./images/cold drink 1.5l.jpeg",
        desc: "Pepsi, 7up, Sprite, Dew, Coca-Cola — 500ml & 1.5L",
        smallPepsiPrice: 100,
        largePepsiPrice: 200,
      },
      {
        name: "Water Bottle",
        image: "./images/Water.jpg",
        desc: "Fresh mineral water — 500ml and 1.5 Liter",
        smallWaterPrice: 40,
        LargeWaterPrice: 60,
      },
      {
        name: "Naan",
        image: "./images/naan.jpg",
        desc: "Tandoori naan crafted with love, fresh from oven",
        singleNaanPrice: 30,
        doubleNaanPrice: 50,
      },
      {
        name: "Puri Paratha",
        image: "./images/puti paratha.jpg",
        desc: "Crispy golden paratha made fresh daily",
        price: 50,
      },
    ],
  },
];

function getSizes(item) {
  let sizes = [];

  if (item.smallPizzaPrice) {
    sizes.push({ label: "Small", price: item.smallPizzaPrice });
  }
  if (item.mediumPizzaPrice) {
    sizes.push({ label: "Medium", price: item.mediumPizzaPrice });
  }
  if (item.largePizzaPrice) {
    sizes.push({ label: "Large", price: item.largePizzaPrice });
  }
  if (item.extraLargePizza) {
    sizes.push({ label: "Extra Large", price: item.extraLargePizza });
  }

  if (item.smallPepsiPrice) {
    sizes.push({ label: "Small Pepsi", price: item.smallPepsiPrice });
  }
  if (item.largePepsiPrice) {
    sizes.push({ label: "Large Pepsi", price: item.largePepsiPrice });
  }

  if (item.smallWaterPrice) {
    sizes.push({ label: "Small water", price: item.smallWaterPrice });
  }
  if (item.LargeWaterPrice) {
    sizes.push({ label: "Large water", price: item.LargeWaterPrice });
  }

  if (item.singleNaanPrice) {
    sizes.push({ label: "Single Naan", price: item.singleNaanPrice });
  }
  if (item.doubleNaanPrice) {
    sizes.push({ label: "Double Naan", price: item.doubleNaanPrice });
  }

  return sizes;
}

let html = "";
menuSection.forEach((section) => {
  if (!section.items || section.items.length === 0) return;

  html += `<h3 id="${section.id}">${section.title}</h3><div class="pizza-section">`;

  section.items.forEach((item, index) => {
    item.id = `${section.id}-${index}`;

    let sizes = getSizes(item);
    // console.log(sizes)
    html += `
        <div class="pizza-section-boxes" data-section-id="${section.id}" data-index="${index}">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="manu-card-cointainer">
        <h4>${item.name}
        <a href="# >
        <i class="ri-heart-line"></i>
        </a>
        </h4>
        <p>${item.desc}</p>
        <h5>From <span>Rs.${sizes.length > 0 ? sizes[0].price : item.price}</span></h5>
        
        </div>  
        </div>`;
  });
  html += "</div>";
});

// console.log(menuSection)
// console.log(html)
document.querySelector(".menu-container").innerHTML = html;

// popup Html___________-----------------____________-____----__--__--__--___--

let card = document.querySelector(".menu-container");
card.addEventListener("click", (event) => {
  let popupHtml = "";
  let clickedBox = event.target.closest(".pizza-section-boxes");
  let popupOverlay = document.querySelector(".popup-overlay");

  let id = clickedBox.dataset.sectionId;
  let index = clickedBox.dataset.index;
  // console.log(index)
  let foundSection = menuSection.find((section) => section.id === id);

  let foundItem = foundSection.items[index];
  let sizes = getSizes(foundItem);

//   console.log(foundItem);

 popupHtml = `<div id="pop-up">
    <button class="popup-close-btn" id="popup-close">&#x2715;</button>
    <img class="popup-image" src="${foundItem.image}" alt="">
    <h4 class="popup-name">${foundItem.name}</h4>
    <p class="popup-para">${foundItem.desc}</p>
    <h5 class="popup-price">RS:${sizes.length > 0 ? sizes[0].price : foundItem.price}</h5>
    <div class="sizes-grid"></div>
    
    <div class="popup-bottom-bar">
        <div class="popup-qty-controls">
            <button class="popup-qty-decrease">−</button>
            <span class="popup-qty-display">1</span>
            <button class="popup-qty-increase">+</button>
        </div>
        <button class="popup-add-btn">Add to Order &nbsp; RS:${sizes.length > 0 ? sizes[0].price : foundItem.price}</button>
    </div>
    
    </div>`
 

  popupOverlay.innerHTML = popupHtml;
  document.querySelector(".popup-overlay").style.display = "flex";
//   console.log(popupHtml);

  let btnLabel;
  let btnPrice;

//   console.log(btnLabel);

  if (sizes.length > 0) {
    sizes.forEach((item, index) => {
      document.querySelector(".sizes-grid").innerHTML +=
        `<button data-price="${item.price}" data-label ="${item.label}" class = "popup-multi-button-${index} popup-multi-button">${item.label} <p> &nbspRs.${item.price}</p> </button>`;
      document.querySelector(".sizes-grid").style.display = "grid";
      document.querySelector(".popup-price").style.display = "none";
    });

    let popupMulitButton = document.querySelectorAll(".popup-multi-button");
    popupMulitButton.forEach((button, index) => {
      button.addEventListener("click", (event) => {
        popupMulitButton.forEach((btn) => {
          btn.classList.remove("selected");
        });
        event.target.classList.add("selected");

        // let sizesButtonLabel = popupMulitButton-index.dataset.label
        // let sizesButtonPrice = popupMulitButton-index.dataset.price
        // let btn = document.querySelector(`.popup-multi-button-${index}`)

        btnLabel = button.dataset.label;
        btnPrice = button.dataset.price;

        // console.log(btnLabel);
        // console.log(btnPrice);
        // console.log(sizesButtonLabel)
        // console.log(sizesButtonPrice)
        document.querySelector(".popup-add-btn").innerHTML =
          `Add to Cart<br>RS:${button.dataset.price}`;
      });
    });
    btnLabel = sizes[0].label;
    btnPrice = sizes[0].price;
    document.querySelector(".popup-multi-button-0").classList.add("selected");

    document.querySelector(".popup-add-btn").addEventListener("click", () => {
      popupOverlay.style.display = "none";
    });
  }
  document.querySelector(".popup-close-btn").addEventListener("click", () => {
    document.querySelector(".popup-overlay").style.display = "none";
  });

  popupOverlay.addEventListener("click", (event) => {
    if (event.target === popupOverlay) {
      popupOverlay.style.display = "none";
    }
  });

  let addToCartbtn = document.querySelector(".popup-add-btn");

  addToCartbtn.addEventListener("click", () => {
    popupOverlay.style.display = "none";
    let itemQuantity = 1;

    let matching = cart.find((item) => foundItem.id === item.id);

    // console.log(matching);

    if (sizes.length > 0) {
      let matching = cart.find((item) => foundItem.id === item.id && btnLabel === item.label);
      if (matching) {
        matching.quantity  += 1
      } else {
        cart.push({
          name: foundItem.name,
          id: foundItem.id,
          image: foundItem.image,
          price:  btnPrice ,
          label:  btnLabel,
          quantity: itemQuantity,
        });
      }
    } else if (matching) {
      matching.quantity  += 1;
    } else {
      cart.push({
        name: foundItem.name,
        id: foundItem.id,
        image: foundItem.image,
        price: sizes.length > 0 ? sizes[0].price : foundItem.price,
        label: "",
        quantity: itemQuantity,
      });
    }
    localStorage.setItem('cart',JSON.stringify(cart))
    updateCartNum()

});
});

function updateCartNum(){
    let cartQuantity1 = document.querySelector(".cart-count2")
    let cartQuantity2 = document.querySelector(".cart-count1")
    let cartTotalQuantity = 0

cart.forEach(item =>{
    cartTotalQuantity += item.quantity
})

    cartQuantity1.innerHTML = cartTotalQuantity
    cartQuantity2.innerHTML = cartTotalQuantity

}

updateCartNum()

// nav selection-----------------------------------
const sections = document.querySelectorAll('h3[id]');
const navLinks = document.querySelectorAll('.nav2 .items a');
const nav2 = document.querySelector('.nav2')

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(sec => {
        if (window.scrollY >= sec.offsetTop - 170) {
            current = sec.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.parentElement.classList.remove('active');
        
        if (link.getAttribute('href') === `#${current}`) {
            link.parentElement.classList.add('active');
            
            setTimeout(() => {
                link.parentElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    inline: 'center', 
                    block: 'nearest' 
                })
            }, 100)
        }
    });
});