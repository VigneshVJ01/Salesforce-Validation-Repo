require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const session = require("express-session");

const app = express();

const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://salesforce-validation-repo.onrender.com/auth/callback";

app.use(express.json());
app.set("trust proxy", 1);

app.use(
  session({
    secret: "salesforce_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ================= LOGIN =================
app.get("/auth/login", (req, res) => {
  const { clientId, clientSecret, loginUrl } = req.query;

  req.session.clientId = clientId;
  req.session.clientSecret = clientSecret;
  req.session.loginUrl = loginUrl;

  const authUrl = `${loginUrl}/services/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.redirect(authUrl);
});

// ================= CALLBACK =================
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  const loginUrl = req.session.loginUrl;
  const clientId = req.session.clientId;

  try {
const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: req.session.clientId,
    client_secret: req.session.clientSecret,
    redirect_uri: REDIRECT_URI,
    code,
  }),
});

    const data = await tokenRes.json();

    if (!data.access_token) {
      console.log("TOKEN ERROR:", data);
      return res.send("❌ Token not received. Check Client ID or org setup.");
    }

    req.session.accessToken = data.access_token;
    req.session.instanceUrl = data.instance_url;

    req.session.save(() => res.redirect("/"));

  } catch (err) {
    console.error(err);
    res.send("Authentication failed");
  }
});

// ================= FETCH RULES =================
app.post("/api/validationRules", async (req, res) => {
  const { instanceUrl, accessToken } = req.session;

  if (!accessToken) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const queryRes = await fetch(
    `${instanceUrl}/services/data/v59.0/tooling/query/?q=SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinitionId='Account'`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const queryData = await queryRes.json();

  const rules = await Promise.all(
    queryData.records.map(async (rule) => {
      const resMeta = await fetch(
        `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${rule.Id}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const meta = await resMeta.json();

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
});

// ================= TOGGLE =================
app.post("/api/toggleRuleApex", async (req, res) => {
  const { instanceUrl, accessToken } = req.session;
  const { ruleId, newState } = req.body;

  if (!accessToken) {
    return res.status(401).send("Not logged in");
  }

  const getRes = await fetch(
    `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const rule = await getRes.json();

  await fetch(
    `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        FullName: rule.FullName,
        Metadata: { ...rule.Metadata, active: newState },
      }),
    }
  );

  res.send("Updated");
});

app.listen(3000, () => console.log("Server running"));