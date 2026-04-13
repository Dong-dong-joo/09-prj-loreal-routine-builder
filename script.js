const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const generateRoutineBtn = document.getElementById("generateRoutine");
const clearSelectionsBtn = document.getElementById("clearSelections");
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const rtlToggle = document.getElementById("rtlToggle");

const STORAGE_KEY = "loreal-selected-products";
const RTL_KEY = "loreal-rtl-mode";

/* IMPORTANT: Replace this with your deployed Cloudflare Worker URL */
const WORKER_URL = "https://calm-feather-1e24.dkim234.workers.dev";

let allProducts = [];
let selectedProductIds = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let conversationHistory = [
  {
    role: "system",
    content:
      "You are a helpful beauty and skincare assistant. Only answer questions related to skincare, haircare, makeup, fragrance, beauty routines, or the selected products. Keep answers clear, personalized, and practical.",
  },
];

function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProductIds));
}

function saveRTLMode(isRTL) {
  localStorage.setItem(RTL_KEY, JSON.stringify(isRTL));
}

function loadRTLMode() {
  const saved = JSON.parse(localStorage.getItem(RTL_KEY));
  if (saved) {
    document.documentElement.setAttribute("dir", "rtl");
  } else {
    document.documentElement.setAttribute("dir", "ltr");
  }
}

function addChatMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setInitialChatMessage() {
  if (!chatWindow.innerHTML.trim()) {
    addChatMessage(
      "assistant",
      "Select products, then click Generate Routine. After that, you can ask follow-up questions here.",
    );
  }
}

async function loadProducts() {
  try {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
    renderProducts();
    renderSelectedProducts();
    updateGenerateButtonState();
  } catch (error) {
    productsContainer.innerHTML = `
      <div class="empty-message">Could not load products.</div>
    `;
    console.error("Error loading products:", error);
  }
}

function getFilteredProducts() {
  const selectedCategory = categoryFilter.value;
  const searchValue = productSearch.value.trim().toLowerCase();

  return allProducts.filter((product) => {
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;

    const matchesSearch =
      product.name.toLowerCase().includes(searchValue) ||
      product.brand.toLowerCase().includes(searchValue) ||
      product.description.toLowerCase().includes(searchValue) ||
      product.category.toLowerCase().includes(searchValue);

    return matchesCategory && matchesSearch;
  });
}

function renderProducts() {
  const filteredProducts = getFilteredProducts();

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="empty-message">No matching products found.</div>
    `;
    return;
  }

  productsContainer.innerHTML = filteredProducts
    .map((product) => {
      const isSelected = selectedProductIds.includes(product.id);

      return `
        <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}">
          <div class="product-top">
            <img src="${product.image}" alt="${product.name}" />
            <div class="product-info">
              <div class="product-brand">${product.brand}</div>
              <div class="product-name">${product.name}</div>
            </div>
          </div>

          <div class="product-actions">
            <button class="card-btn select-btn ${
              isSelected ? "selected-btn" : ""
            }" data-action="select" data-id="${product.id}" type="button">
              ${isSelected ? "Unselect" : "Select"}
            </button>

            <button class="card-btn desc-btn" data-action="desc" data-id="${product.id}" type="button">
              Description
            </button>
          </div>

          <div class="product-description" id="desc-${product.id}">
            ${product.description}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSelectedProducts() {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.includes(product.id),
  );

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `<p>No products selected yet.</p>`;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-item">
          <span>${product.brand} - ${product.name}</span>
          <button class="remove-chip" data-remove-id="${product.id}" type="button">×</button>
        </div>
      `,
    )
    .join("");
}

function updateGenerateButtonState() {
  generateRoutineBtn.disabled = selectedProductIds.length === 0;
}

function toggleProductSelection(productId) {
  if (selectedProductIds.includes(productId)) {
    selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  } else {
    selectedProductIds.push(productId);
  }

  saveSelections();
  renderProducts();
  renderSelectedProducts();
  updateGenerateButtonState();
}

function removeSelectedProduct(productId) {
  selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  saveSelections();
  renderProducts();
  renderSelectedProducts();
  updateGenerateButtonState();
}

function clearAllSelections() {
  selectedProductIds = [];
  saveSelections();
  renderProducts();
  renderSelectedProducts();
  updateGenerateButtonState();
}

function getSelectedProductsData() {
  return allProducts.filter((product) =>
    selectedProductIds.includes(product.id),
  );
}

async function callWorker(
  messages,
  selectedProducts = [],
  useWebSearch = false,
) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      selectedProducts,
      useWebSearch,
    }),
  });

  if (!response.ok) {
    throw new Error("Worker request failed");
  }

  return response.json();
}

async function generateRoutine() {
  const selectedProducts = getSelectedProductsData();

  if (selectedProducts.length === 0) {
    addChatMessage("assistant", "Please select at least one product first.");
    return;
  }

  const productSummary = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  addChatMessage("assistant", "Generating your routine...");

  const routinePrompt = `
Build a personalized beauty routine using ONLY these selected products.
Explain the order of use, morning vs night if relevant, and simple tips.
If a product does not clearly fit, say so.
Selected products:
${JSON.stringify(productSummary, null, 2)}
  `.trim();

  conversationHistory.push({
    role: "user",
    content: routinePrompt,
  });

  try {
    const data = await callWorker(conversationHistory, productSummary, true);

    const reply = data.reply || "Sorry, I could not generate a routine.";
    conversationHistory.push({
      role: "assistant",
      content: reply,
    });

    chatWindow.innerHTML = "";
    addChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    addChatMessage(
      "assistant",
      "Sorry, something went wrong while generating the routine.",
    );
  }
}

async function sendFollowUpQuestion(question) {
  const selectedProducts = getSelectedProductsData();

  addChatMessage("user", question);

  conversationHistory.push({
    role: "user",
    content: question,
  });

  try {
    const data = await callWorker(conversationHistory, selectedProducts, true);
    const reply = data.reply || "Sorry, I could not answer that.";

    conversationHistory.push({
      role: "assistant",
      content: reply,
    });

    addChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    addChatMessage(
      "assistant",
      "Sorry, something went wrong while getting the response.",
    );
  }
}

productsContainer.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const productId = Number(event.target.dataset.id);

  if (!action || !productId) return;

  if (action === "select") {
    toggleProductSelection(productId);
  }

  if (action === "desc") {
    const desc = document.getElementById(`desc-${productId}`);
    if (desc) {
      desc.classList.toggle("show");
    }
  }
});

selectedProductsList.addEventListener("click", (event) => {
  const productId = Number(event.target.dataset.removeId);
  if (!productId) return;
  removeSelectedProduct(productId);
});

categoryFilter.addEventListener("change", renderProducts);
productSearch.addEventListener("input", renderProducts);

generateRoutineBtn.addEventListener("click", generateRoutine);

clearSelectionsBtn.addEventListener("click", clearAllSelections);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  userInput.value = "";
  await sendFollowUpQuestion(question);
});

rtlToggle.addEventListener("click", () => {
  const currentDir = document.documentElement.getAttribute("dir");
  const isRTL = currentDir !== "rtl";

  document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
  saveRTLMode(isRTL);
});

loadRTLMode();
loadProducts();
setInitialChatMessage();
