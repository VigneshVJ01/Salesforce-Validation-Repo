// ================= LOGIN =================
document.getElementById("loginBtn").addEventListener("click", () => {
    window.location.href = "/auth/login";
});

// ================= FETCH RULES =================
function fetchValidationRules() {
    fetch("/api/validationRules", {
        method: "POST"
    })
    .then(res => {
        if (!res.ok) {
            throw new Error("Please login first");
        }
        return res.json();
    })
    .then(rules => displayRules(rules))
    .catch(err => {
        document.getElementById("rulesContainer").innerHTML =
            `<p style="color:red;">${err.message}</p>`;
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
                <input type="checkbox" id="toggle-${rule.id}" ${rule.active ? "checked" : ""}>
            </div>
            <p><b>Field:</b> ${rule.errorField}</p>
            <p><b>Message:</b> ${rule.errorMessage}</p>
        </div>
        `;

        container.appendChild(div);

        document
            .getElementById(`toggle-${rule.id}`)
            .addEventListener("change", (e) => {
                toggleRule(rule.id, e.target.checked);
            });
    });
}

// ================= TOGGLE =================
function toggleRule(ruleId, newState) {
    fetch("/api/toggleRuleApex", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ ruleId, newState })
    })
    .then(res => res.text())
    .then(() => {
        alert("✅ Rule updated!");
    })
    .catch(() => {
        alert("❌ Failed to update");
    });
}

// ================= AUTO LOAD =================
window.onload = () => {
    fetchValidationRules();
};