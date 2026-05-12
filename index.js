const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const Fuse = require('fuse.js');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

require('dotenv').config();

const app = express();

app.use(express.json());

// ================= CORS (UNCHANGED STYLE) =================
const allowedOrigins = [
  "https://eneba-front-end.vercel.app",
  "https://rallyshotfrontend.vercel.app",
  "http://localhost:3000",
  "http://192.168.1.247:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: "deyvgd589",
  api_key: "848798133135438",
  api_secret: "TRaeBHUSGzvB3UPZA4heXYYFU5E"
});

// FIXED STORAGE (same structure, only safe + correct)
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    resource_type: "auto",
    type: "upload", // ✅ FIXED (was "private" causing 404 issues)
    public_id: (req, file) =>
      Date.now() + "_" + file.originalname
  }
});

const upload = multer({ storage });

// ================= MYSQL (FIXED TYPE SAFETY ONLY) =================
const db = mysql.createPool({
  host: 'tramway.proxy.rlwy.net',
  port: 17541,
  user: 'root',
  password: 'tsfcyHKdvYkyVplEDiZTHRyhQzqyZpTK',
  database: 'railway'
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
  } else {
    console.log("Connected to MySQL!");
    connection.release();
  }
});

// ================= AUTH =================
const JWT_SECRET = "supersecretkey";

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

// ================= SIGNED URL =================
function getSignedUrl(public_id) {
  return cloudinary.url(public_id, {
    type: "upload", // ✅ FIXED (was "private")
    resource_type: "auto",
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + 300
  });
}

// ================= ROUTES =================

// LIST (SAFE)
app.get('/list', (req, res) => {
  const search = req.query.search || '';

  db.query("SELECT * FROM items", (err, rows) => {
    if (err) return res.json([]);

    if (!search) return res.json(rows);

    const fuse = new Fuse(rows, {
      keys: ['item_name'],
      threshold: 0.7,
    });

    res.json(fuse.search(search).map(r => r.item));
  });
});

// ================= UPLOAD =================
app.post("/upload", auth, upload.array("media"), (req, res) => {
  try {
    const { rally_id, price } = req.body;

    if (!rally_id || !price) {
      return res.status(400).json({ error: "Missing fields" });
    }

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
      (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }

        res.json({ uploadedFiles: files });
      }
    );

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= PHOTOS =================
app.get("/photos-with-urls/:rally_id", auth, (req, res) => {
  const { rally_id } = req.params;

  db.query(
    "SELECT * FROM photo WHERE rally_id = ?",
    [rally_id],
    (err, rows) => {
      if (err) return res.json([]);

      const result = rows.map(photo => ({
        ...photo,
        signedUrl: getSignedUrl(photo.public_id)
      }));

      res.json(result);
    }
  );
});

// ================= SINGLE SIGNED URL =================
app.get("/signed-url/:public_id", auth, (req, res) => {
  res.json({
    signedUrl: getSignedUrl(req.params.public_id)
  });
});

// ================= SERVER =================
const PORT = 3001;

app.listen(PORT, () => {
  console.log("Server running on port 3001");
});