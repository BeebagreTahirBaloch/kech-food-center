let cart = JSON.parse(localStorage.getItem('cart')) || []
console.log(cart)



let confirmButton = document.querySelector(".confirm-button")
let cartItemsContainer = document.querySelector(".cart-items-container") 
let orderDetails = document.querySelector(".order-details-box")



cartItemsContainer.addEventListener("click",(event)=>{

    let addbtn = event.target.closest(".add-btn")
    let deletebtn = event.target.closest(".delete-btn")

    // let addbtnIndex = addbtn.dataset.index
    // let deletebtnIndex = deletebtn.dataset.index
    
    if(!addbtn && !deletebtn){
        return
    }


    if(addbtn){
        cart[addbtn.dataset.index].quantity += 1
        localStorage.setItem('cart',JSON.stringify(cart))
        rendering()
    }


    if(deletebtn){

        cart[deletebtn.dataset.index].quantity -= 1

        if(cart[deletebtn.dataset.index].quantity <= 0){
            cart.splice(deletebtn.dataset.index,1)
        }
        rendering()
        localStorage.setItem('cart',JSON.stringify(cart))
        
    }
})



// ==================== INLINE ERROR MESSAGE HELPER ====================
// Shows a small red text message near a given element instead of using alert().
// targetEl: the element to attach the message near
// message: the text to show
// id: unique id so repeated calls update the same message instead of stacking
// position: "afterend" (default, inserts after targetEl) or "beforebegin" (inserts before targetEl)
function showInlineError(targetEl, message, id, position){

    position = position || "afterend"

    if(!document.getElementById(id + "-style")){
        let style = document.createElement("style")
        style.id = id + "-style"
        style.innerHTML = `
            .inline-error-text{
                color: #d40000;
                font-size: 13px;
                font-weight: 600;
                margin: 6px 0;
                display: block;
                width: 100%;
                text-align: center;
            }
        `
        document.head.appendChild(style)
    }

    let existing = document.getElementById(id)
    if(existing){
        existing.innerHTML = message
        clearTimeout(existing._hideTimeout)
        existing._hideTimeout = setTimeout(()=>{ existing.remove() }, 3000)
        return
    }

    let errorEl = document.createElement("div")
    errorEl.id = id
    errorEl.className = "inline-error-text"
    errorEl.innerHTML = message

    targetEl.insertAdjacentElement(position, errorEl)

    errorEl._hideTimeout = setTimeout(()=>{ errorEl.remove() }, 3000)
}
// ========================================================================




// ==================== UNDER DEVELOPMENT POPUP ====================
// Injects the styling and markup for the "under development" popup.
// Safe to call multiple times; it only builds the popup once.
function showUnderDevelopmentPopup(){

    if(!document.getElementById("dev-popup-style")){
        let style = document.createElement("style")
        style.id = "dev-popup-style"
        style.innerHTML = `
            .dev-popup-overlay{
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }
            .dev-popup-box{
                background: #ffffff;
                border: 4px solid #d40000;
                border-radius: 16px;
                max-width: 380px;
                width: 90%;
                padding: 30px 24px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                position: relative;
                font-family: inherit;
            }
            .dev-popup-close{
                position: absolute;
                top: 10px;
                right: 14px;
                background: none;
                border: none;
                font-size: 22px;
                color: #d40000;
                cursor: pointer;
                font-weight: bold;
            }
            .dev-popup-icon{
                font-size: 42px;
                margin-bottom: 10px;
            }
            .dev-popup-title{
                color: #d40000;
                font-size: 20px;
                font-weight: 800;
                margin-bottom: 12px;
                text-transform: uppercase;
            }
            .dev-popup-message{
                color: #222;
                font-size: 15px;
                line-height: 1.5;
                margin-bottom: 20px;
            }
            .dev-popup-button{
                background: #d40000;
                color: #ffffff;
                border: none;
                padding: 12px 28px;
                border-radius: 30px;
                font-size: 15px;
                font-weight: 700;
                cursor: pointer;
                letter-spacing: 0.5px;
            }
            .dev-popup-button:hover{
                background: #a80000;
            }
        `
        document.head.appendChild(style)
    }

    let overlay = document.createElement("div")
    overlay.className = "dev-popup-overlay"
    overlay.innerHTML = `
        <div class="dev-popup-box">
            <button class="dev-popup-close">&times;</button>
            <div class="dev-popup-icon">🍔</div>
            <div class="dev-popup-title">We're Still Cooking!</div>
            <div class="dev-popup-message">
                Sorry for the inconvenience — this website is under development.<br>
                Please visit the main branch for orders.
            </div>
            <button class="dev-popup-button">Okay, Got It</button>
        </div>
    `

    document.body.appendChild(overlay)

    function closePopup(){
        overlay.remove()
    }

    overlay.querySelector(".dev-popup-close").addEventListener("click", closePopup)
    overlay.querySelector(".dev-popup-button").addEventListener("click", closePopup)
    overlay.addEventListener("click",(e)=>{
        if(e.target === overlay){
            closePopup()
        }
    })
}
// ===================================================================




if(cart.length > 0){
confirmButton.addEventListener("click",()=>{
    

    inputAdress =  document.querySelector(".input-address")
    if(inputAdress.value === ''){
        showInlineError(inputAdress, "Please enter your address", "address-error")
    return
    }

    // ---- Order confirmation temporarily disabled: show under-development popup ----
    showUnderDevelopmentPopup()
    return

// order detail rendering to whatsapp--------------------------------
    // let orderDetails = cart.map(item => 
    // `${item.name} ${item.label || ''} x${item.quantity} = RS.${item.price * item.quantity}`
    // ).join('%0A')
    // let address = inputAdress.value;
    // let totalAmount = cart.reduce((total, item) => total + (item.price * item.quantity), 0)
    // let hasSome = cart.some(items => items.quantity > 0)
    // let deliveryCharges = hasSome ? 100 : 0;

    // let message = `🍔 *New Order - Kech Food Center*%0A%0A${orderDetails}%0A%0A💰 *DeliveryCharges: RS.${deliveryCharges}*%0A  *Total: RS.${totalAmount + 100}*%0A 📍 *Address:* ${address}%0A%0A_Please confirm this order_`

    // let phoneNumber = "923352053652" // delivery guy number

    // window.open(`https://wa.me/${phoneNumber}?text=${message}`)

// ------------------------------------------------------------------


})
}



function rendering(){
let cartHtml = ''
cart.forEach((item,index)=>{
    
    let Total = item.quantity * item.price

    cartHtml += ` <div class="cart-item">
                <div class="cart-item-left">
                    <img src=".${item.image}" alt="${item.name}">
                    <div>
                        <p class="cart-item-name">${item.name} &nbsp ${item.label}</p>
                        <p class="cart-item-price">Rs. ${item.price}</p>
                    </div>
                </div>
                <div class="cart-item-controls">
                    <button data-index="${index}" class="delete-btn"><i class="ri-delete-bin-line"></i></button>
                    <span class="cart-item-qty">${item.quantity}</span>
                    <button data-index="${index}" class="add-btn">+</button>
                </div>
                <p class="cart-item-total">RS<br>${Total}</p>
            </div>`

        })


      if(cart.length === 0 ){
        // cartItemsContainer.style.display = "none"
        document.querySelector(".voucher-box").style.display = "none"
        document.querySelector(".confirm-button").style.color = "red"
        document.querySelector(".breakdown-total").innerHTML = 0;
        document.querySelector(".breakdown-dilavery").innerHTML=0;
        document.querySelector(".breakdown-grand").innerHTML=0;
        document.querySelector(".confirm-summary-items").innerHTML='0 ITEMS';
        document.querySelector(".confirm-summary-Total-price").innerHTML='RS.0';
        document.querySelector(".cart-count2").innerHTML = 0;
        document.querySelector(".cart-count1").innerHTML = 0;
        document.querySelector(".confirm-button").addEventListener("click",()=>{
            showInlineError(document.querySelector(".input-address"), "Please add an item for the order 🍕🍔🍟", "empty-cart-error", "beforebegin")
        })
        cartItemsContainer.innerHTML = `<div class="empty-cart">
            <p>Your cart is empty! But Your Stomach does not have to!</p>
            <a href="../index.html"><button>START YOUR ORDER</button></a>
            </div>`;
      }else{  
            cartItemsContainer.innerHTML = cartHtml
            updateBreakdown()
            }
}




function updateBreakdown(){
let breakDownTotal = document.querySelector(".breakdown-total")
let breakDownDelivery = document.querySelector(".breakdown-dilavery")
let breakDownGrandTotal = document.querySelector(".breakdown-grand")
let confirmSummaryItems = document.querySelector(".confirm-summary-items")
let confirmSummaryTotalPrice = document.querySelector(".confirm-summary-Total-price")
let cartCount1 = document.querySelector(".cart-count1")
let cartCount2 = document.querySelector(".cart-count2")

let totalItems = 0 ;
let Total = 0;
let grandTotal = 0;


let deliveryCharges = 0
cart.forEach((item,index)=>{
    totalItems += item.quantity
    cartCount1.innerHTML = totalItems
    cartCount2.innerHTML = totalItems


    console.log(totalItems)
    Total += item.quantity * item.price

    if(totalItems > 0){
        deliveryCharges = 100
    }else{
        deliveryCharges = 0
    }

    console.log(deliveryCharges)

    grandTotal = Total + deliveryCharges
    breakDownTotal.innerHTML = Total
    breakDownDelivery.innerHTML = deliveryCharges
    breakDownGrandTotal.innerHTML = grandTotal 
    confirmSummaryItems.innerHTML = `${totalItems} ITEMS `
    confirmSummaryTotalPrice.innerHTML = `RS. ${grandTotal}`
})
}




rendering()
// localStorage.clear()