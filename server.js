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
    "https://jxtxvg.up.railway.app"
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
const users = [];

/* =========================
   HEALTH CHECK
========================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   SIGNUP
========================= */
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const existing = users.find(u => u.email === email);
    if (existing) {
      return res.status(400).json({ error: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = {
      id: Date.now().toString(),
      email,
      name,
      password: hashed,
      role: "user"
    };

    users.push(user);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, email, name } });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
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
   ROOT ROUTE (NO STATIC OVERRIDE)
========================= */
app.get("/", (req, res) => {
  res.send("API is running");
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* =========================
   START SERVER (RAILWAY SAFE)
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});