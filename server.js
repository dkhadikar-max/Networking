// ===============================
// IMPORTS
// ===============================
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// SUPABASE INIT
// ===============================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing Supabase ENV variables");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===============================
// ADMIN EMAILS
// ===============================
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// ===============================
// MIDDLEWARE
// ===============================
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: [
      "https://buildyournetwork.online",
      "https://www.buildyournetwork.online",
      "http://localhost:3000"
    ],
    credentials: true
  })
);

app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
app.use(limiter);

// ===============================
// LOGGER
// ===============================
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
});

// ===============================
// STATIC (FRONTEND)
// ===============================
app.use(express.static(path.join(process.cwd(), "public")));

// ===============================
// HEALTH
// ===============================
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ===============================
// SIGNUP
// ===============================
app.post("/api/signup", async (req, res) => {
  try {
    let { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "All fields required" });
    }

    email = email.toLowerCase().trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const user = data.user;

    const isAdmin = ADMIN_EMAILS.includes(email);

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email,
        name,
        role: isAdmin ? "admin" : "user"
      });

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// ===============================
// LOGIN
// ===============================
app.post("/api/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    email = email.toLowerCase().trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const user = data.user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: "Profile not found" });
    }

    return res.json({
      token: data.session.access_token,
      user: {
        id: user.id,
        email: user.email,
        name: profile.name,
        role: profile.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ===============================
// ADMIN ROUTES
// ===============================

// Analytics
app.get("/api/admin/analytics", async (req, res) => {
  try {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    res.json({
      totalUsers: count || 0,
      activeUsers: count || 0,
      premiumUsers: 0,
      verifiedUsers: 0,
      profileCompletion: 100,
      connections: 0,
      messages: 0,
      reports: 0,
      blocks: 0
    });

  } catch (err) {
    res.status(500).json({ error: "Analytics failed" });
  }
});

// Users
app.get("/api/admin/users", async (req, res) => {
  try {
    const { data } = await supabase.from("profiles").select("*");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Users fetch failed" });
  }
});

// Logs
app.get("/api/admin/logs", (req, res) => {
  res.json([]);
});

// ===============================
// FRONTEND ROUTE (SPA)
// ===============================
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});