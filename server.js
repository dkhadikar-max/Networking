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
// SUPABASE
// ===============================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase ENV variables");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ===============================
// CONFIG
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

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120
}));

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
// STATIC (WEB)
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

    // CREATE AUTH USER
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const user = data.user;

    const isAdmin = ADMIN_EMAILS.includes(email);

    // CREATE PROFILE
    const { error: profileError } = await supabase.from("users").insert({
      id: user.id,
      email,
      name,
      role: isAdmin ? "admin" : "user"
    });

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    res.json({
      success: true,
      role: isAdmin ? "admin" : "user"
    });

  } catch (err) {
    console.error(err);
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
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: "Profile not found" });
    }

    res.json({
      token: data.session.access_token,
      user: {
        id: user.id,
        email: user.email,
        name: profile.name,
        role: profile.role
      }
    });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ===============================
// AUTH MIDDLEWARE
// ===============================
async function requireUser(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ error: "No token" });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = data.user;
    next();

  } catch {
    res.status(401).json({ error: "Auth failed" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    await requireUser(req, res, async () => {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", req.user.id)
        .single();

      if (profile.role !== "admin") {
        return res.status(403).json({ error: "Not admin" });
      }

      next();
    });
  } catch {
    res.status(401).json({ error: "Auth failed" });
  }
}

// ===============================
// ADMIN ROUTES
// ===============================

// Analytics
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  const { count } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  res.json({
    totalUsers: count || 0,
    activeUsers: count || 0
  });
});

// Users
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const { data } = await supabase.from("users").select("*");
  res.json(data);
});

// Logs
app.get("/api/admin/logs", requireAdmin, (req, res) => {
  res.json([]);
});

// ===============================
// SPA FALLBACK
// ===============================
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// ===============================
// START
// ===============================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});