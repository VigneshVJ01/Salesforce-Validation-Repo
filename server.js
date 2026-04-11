require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const session = require("express-session");

const app = express();

// ================= CONFIG =================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://salesforce-validation-repo.onrender.com/auth/callback";

// ================= MIDDLEWARE =================
app.use(express.json());

// 🔥 IMPORTANT FIX FOR RENDER (SESSION)
app.set("trust proxy", 1);

app.use(
  session({
    secret: "salesforce_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,      // required for HTTPS (Render)
      httpOnly: true,
      sameSite: "none",  // required for OAuth redirect
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
  const authUrl = `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(authUrl);
});

// ================= CALLBACK =================
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const tokenRes = await fetch(
      "https://login.salesforce.com/services/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        }),
      }
    );

    const data = await tokenRes.json();

    // 🔥 SAVE SESSION PROPERLY
    req.session.accessToken = data.access_token;
    req.session.instanceUrl = data.instance_url;

    // ensure session is saved before redirect
    req.session.save(() => {
      res.redirect("/");
    });

  } catch (err) {
    console.error("OAuth Error:", err);
    res.status(500).send("Authentication failed");
  }
});

// ================= FETCH RULES =================
app.post("/api/validationRules", async (req, res) => {
  try {
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

    const rulesWithDetails = await Promise.all(
      queryData.records.map(async (rule) => {
        const resMeta = await fetch(
          `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${rule.Id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const metaData = await resMeta.json();

        return {
          id: rule.Id,
          name: rule.ValidationName,
          active: rule.Active,
          errorField:
            metaData.Metadata?.errorDisplayField ||
            metaData.Metadata?.errorLocation ||
            "N/A",
          errorMessage: metaData.Metadata?.errorMessage || "No Message",
        };
      })
    );

    res.json(rulesWithDetails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching rules" });
  }
});

// ================= TOGGLE RULE =================
app.post("/api/toggleRuleApex", async (req, res) => {
  const { instanceUrl, accessToken } = req.session;
  const { ruleId, newState } = req.body;

  try {
    if (!accessToken) {
      return res.status(401).send("Not logged in");
    }

    const getRes = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const ruleData = await getRes.json();

    const updateRes = await fetch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          FullName: ruleData.FullName,
          Metadata: {
            active: newState,
            description: ruleData.Metadata.description,
            errorConditionFormula:
              ruleData.Metadata.errorConditionFormula,
            errorMessage: ruleData.Metadata.errorMessage,
            errorDisplayField: ruleData.Metadata.errorDisplayField,
          },
        }),
      }
    );

    if (updateRes.ok) {
      res.send("Success");
    } else {
      const errText = await updateRes.text();
      res.status(500).send(errText);
    }
  } catch (err) {
    console.error("Toggle Error:", err);
    res.status(500).send("Error updating rule");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});