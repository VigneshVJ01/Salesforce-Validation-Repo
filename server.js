require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const session = require("express-session");

const app = express();

const REDIRECT_URI = "https://salesforce-validation-repo.onrender.com/auth/callback";

app.use(express.json());
app.set("trust proxy", 1);

app.use(
  session({
    secret: "salesforce_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ================= ROOT =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= LOGIN =================
app.get("/auth/login", (req, res) => {
  const { clientId, clientSecret, loginUrl } = req.query;

  if (!clientId || !clientSecret || !loginUrl) {
    return res.status(400).send("Missing clientId, clientSecret, or loginUrl");
  }

  req.session.clientId = clientId;
  req.session.clientSecret = clientSecret;
  req.session.loginUrl = loginUrl;

  req.session.save((err) => {
    if (err) console.error("Session save error:", err);

    const authUrl = `${loginUrl}/services/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.redirect(authUrl);
  });
});

// ================= CALLBACK =================
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  const { loginUrl, clientId, clientSecret } = req.session;

  if (!loginUrl || !clientId || !clientSecret) {
    return res.status(400).send("Session expired. Please login again.");
  }

  try {
    const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      console.error("TOKEN ERROR:", data);
      return res.status(500).send(`Token error: ${JSON.stringify(data)}`);
    }

    req.session.accessToken = data.access_token;
    req.session.instanceUrl = data.instance_url;

    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      res.redirect("/");
    });

  } catch (err) {
    console.error("OAuth Error:", err);
    res.status(500).send("Authentication failed");
  }
});

// ================= FETCH RULES =================
app.post("/api/validationRules", async (req, res) => {
  const { instanceUrl, accessToken } = req.session;

  if (!accessToken) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const queryRes = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/query/?q=SELECT+Id,ValidationName,Active+FROM+ValidationRule+WHERE+EntityDefinitionId='Account'`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const queryData = await queryRes.json();

    if (!queryData.records) {
      return res.status(500).json({ error: "Failed to fetch rules", detail: queryData });
    }

    const rules = await Promise.all(
      queryData.records.map(async (rule) => {
        const metaRes = await fetch(
          `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${rule.Id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const meta = await metaRes.json();

        return {
          id: rule.Id,
          name: rule.ValidationName,
          active: rule.Active,
          errorField: meta.Metadata?.errorDisplayField || "N/A",
          errorMessage: meta.Metadata?.errorMessage || "No Message",
        };
      })
    );

    res.json(rules);
  } catch (err) {
    console.error("Fetch Rules Error:", err);
    res.status(500).json({ error: "Error fetching rules" });
  }
});

// ================= TOGGLE RULE =================
app.post("/api/toggleRuleApex", async (req, res) => {
  const { instanceUrl, accessToken } = req.session;
  const { ruleId, newState } = req.body;

  if (!accessToken) {
    return res.status(401).send("Not logged in");
  }

  try {
    const getRes = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const rule = await getRes.json();

    const updateRes = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          FullName: rule.FullName,
          Metadata: {
            ...rule.Metadata,
            active: newState,
          },
        }),
      }
    );

    if (updateRes.ok) {
      res.send("Updated");
    } else {
      const errText = await updateRes.text();
      console.error("Toggle Error Response:", errText);
      res.status(500).send(errText);
    }
  } catch (err) {
    console.error("Toggle Error:", err);
    res.status(500).send("Error updating rule");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));