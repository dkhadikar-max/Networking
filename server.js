import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();

/* =========================
   ENV
========================= */
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "networkapp_secret";

/* =========================
   SECURITY + CORS
========================= */
app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: [
    "https://buildyournetwork.online",
    "https://www.buildyournetwork.online",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =========================
   BODY PARSER (EARLY)
========================= */
app.use(express.json());

/* =========================
   RATE LIMIT
========================= */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});

app.use(limiter);

/* =========================
   LOGGER
========================= */
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode}`
    );
  });
  next();
});

/* =========================
   IN-MEMORY STORE (TEMP)
   Replace with DB later
========================= */


/* =========================
   HEALTH CHECK
========================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   SIGNUP
========================= */
// ===============================
// AUTH: SIGNUP + LOGIN (FINAL)
// ===============================

// In-memory store (temporary)
const users = [];

// Admin whitelist (from env)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "dkhadikar@gmail.com")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// ===============================
// SIGNUP
// ===============================
app.post("/api/signup", async (req, res) => {
  try {
    let { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: "All fields required" });
    }

    email = email.toLowerCase().trim();

    // Check existing user
    const existing = users.find(
      u => u.email.toLowerCase() === email
    );

    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Admin check
    const isAdmin = ADMIN_EMAILS.includes(email);

    // Create user
    const user = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      role: isAdmin ? "admin" : "user"
    };

    users.push(user);

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || "networkapp_secret_2024",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});


// ===============================
// LOGIN
// ===============================
app.post("/api/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    email = email.toLowerCase().trim();

    // Find user
    const user = users.find(
      u => u.email.toLowerCase() === email
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || "networkapp_secret_2024",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});
/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ error: "No token" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
app.use(express.static(path.join(process.cwd(), "public")));

/* =========================
   ADMIN ROUTE
========================= */
app.get("/api/admin", auth, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ message: "Admin access granted" });
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });

});

app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});
/* =========================
   START SERVER (RAILWAY SAFE)
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});