const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const Fuse = require("fuse.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();
app.use(express.json());

const allowedOrigins = [
  "https://eneba-front-end.vercel.app",
  "https://rallyshotfrontend.vercel.app",
  "http://localhost:3000",
  "http://192.168.1.247:3000"
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// IMPORTANT: private + auto works better
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    resource_type: "auto",
    type: "private",
    public_id: (req, file) =>
      `${Date.now()}_${file.originalname.split(".")[0]}`
  }
});

const upload = multer({ storage });

// ================= MYSQL =================
const db = mysql.createPool({
  host: "tramway.proxy.rlwy.net",
  port: 17541,
  user: "root",
  password: process.env.DB_PASSWORD,
  database: "railway"
});

// ================= AUTH =================
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.sendStatus(401);

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

// ================= CLOUDINARY SIGNED URL =================
function getSignedUrl(public_id) {
  return cloudinary.url(public_id, {
    type: "private",
    resource_type: "auto",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + 300
  });
}

// ================= ROUTES =================

// LIST
app.get("/list", (req, res) => {
  const search = req.query.search || "";

  db.query("SELECT * FROM items", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!search) return res.json(rows);

    const fuse = new Fuse(rows, {
      keys: ["item_name"],
      threshold: 0.7
    });

    res.json(fuse.search(search).map(r => r.item));
  });
});

// UPLOAD
app.post("/upload", auth, upload.array("media"), (req, res) => {
  try {
    const { rally_id, price } = req.body;

    if (!rally_id || !price)
      return res.status(400).json({ error: "Missing fields" });

    const files = req.files.map(f => ({
      public_id: f.filename,
      url: f.path
    }));

    const values = files.map(f => [
      rally_id,
      req.user.id,
      price,
      f.public_id
    ]);

    db.query(
      "INSERT INTO photo (rally_id, user_id, price, public_id) VALUES ?",
      [values],
      err => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ uploadedFiles: files });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET PHOTOS WITH SIGNED URLS
app.get("/photos-with-urls/:rally_id", auth, (req, res) => {
  const { rally_id } = req.params;

  db.query(
    "SELECT * FROM photo WHERE rally_id = ?",
    [rally_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const result = rows.map(p => ({
        ...p,
        signedUrl: getSignedUrl(p.public_id)
      }));

      res.json(result);
    }
  );
});

// SIGNED URL SINGLE
app.get("/signed-url/:public_id", auth, (req, res) => {
  res.json({
    signedUrl: getSignedUrl(req.params.public_id)
  });
});

app.listen(3001, () => console.log("Server running on 3001"));