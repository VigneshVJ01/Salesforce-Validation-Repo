// ================= LOGIN =================
function login() {
  const clientId = document.getElementById("clientId").value.trim();
  const clientSecret = document.getElementById("clientSecret").value.trim();
  const loginUrl = document.getElementById("loginUrl").value;

  if (!clientId || !clientSecret) {
    alert("Please enter Client ID and Client Secret");
    return;
  }

  window.location.href = `/auth/login?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&loginUrl=${encodeURIComponent(loginUrl)}`;
}

// ================= FETCH RULES =================
function fetchValidationRules() {
  fetch("/api/validationRules", { method: "POST" })
    .then(res => {
      if (res.status === 401) throw new Error("Please login first");
      if (!res.ok) throw new Error("Server error");
      return res.json();
    })
    .then(rules => displayRules(rules))
    .catch(err => {
      document.getElementById("rulesContainer").innerHTML =
        `<p style="color:#ff6b6b;">${err.message}</p>`;
    });
}

// ================= DISPLAY =================
function displayRules(rules) {
  const container = document.getElementById("rulesContainer");
  container.innerHTML = "";

  if (!rules.length) {
    container.innerHTML = "<p>No validation rules found.</p>";
    return;
  }

  rules.forEach(rule => {
    const div = document.createElement("div");
    div.innerHTML = `
      <div class="rule-card">
        <div class="rule-header">
          <span>${rule.name}</span>
          <label class="switch">
            <input type="checkbox" id="toggle-${rule.id}" ${rule.active ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <p><b>Field:</b> ${rule.errorField}</p>
        <p><b>Message:</b> ${rule.errorMessage}</p>
      </div>
    `;
    container.appendChild(div);

    document.getElementById(`toggle-${rule.id}`)
      .addEventListener("change", (e) => toggleRule(rule.id, e.target.checked));
  });
}

// ================= TOGGLE =================
function toggleRule(ruleId, newState) {
  fetch("/api/toggleRuleApex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ruleId, newState }),
  })
    .then(res => {
      if (!res.ok) throw new Error("Failed");
      alert("✅ Rule updated!");
    })
    .catch(() => alert("❌ Failed to update rule"));
}

// ================= AUTO LOAD =================
window.onload = () => fetchValidationRules();