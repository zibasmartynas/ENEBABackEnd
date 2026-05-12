const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const Fuse = require('fuse.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

const app = express();

// ================= CORS =================
const allowedOrigins = [
  "https://eneba-front-end.vercel.app",
  "https://rallyshotfrontend.vercel.app",
  "http://localhost:3000",
  "http://192.168.1.247:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(express.json());

// ================= AUTH =================
const JWT_SECRET = "supersecretkey";

// ================= CLOUDINARY (FIXED) =================
cloudinary.config({
  cloud_name: "deyvgd589",
  api_key: "848798133135438",
  api_secret: "TRaeBHUSGzvB3UPZA4heXYYFU5E"
});

// 🔥 FIXED: no auto, no private
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    resource_type: "image",
    type: "upload",
    public_id: (req, file) =>
      `rallies/${Date.now()}_${file.originalname.split(".")[0]}`
  }
});

const upload = multer({ storage });

// ================= DB =================
const db = mysql.createPool({
  host: 'tramway.proxy.rlwy.net',
  port: '17541',
  user: 'root',
  password: 'tsfcyHKdvYkyVplEDiZTHRyhQzqyZpTK',
  database: 'railway'
});

// ================= AUTH MIDDLEWARE =================
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

function creatorOnly(req, res, next) {
  if (req.user.creator !== 1) return res.sendStatus(403);
  next();
}

// ================= LOGIN =================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE user_email = ?",
    [email],
    async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.length === 0)
        return res.status(400).json({ error: "Invalid credentials" });

      const user = results[0];

      const valid = await bcrypt.compare(password, user.user_password);

      if (!valid)
        return res.status(400).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        {
          id: user.user_id,
          creator: user.user_creator,
          admin: user.user_admin
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({ token });
    }
  );
});

// ================= REGISTER =================
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE user_email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length > 0)
      return res.status(400).json({ error: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (user_email, user_password, user_creator, user_admin) VALUES (?, ?, 0, 0)",
      [email, hashed],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User created" });
      }
    );
  });
});

// ================= ITEMS =================
app.get('/list', (req, res) => {
  db.query("SELECT * FROM items", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const search = req.query.search || '';
    if (!search) return res.json(rows);

    const fuse = new Fuse(rows, {
      keys: ['item_name'],
      threshold: 0.7
    });

    res.json(fuse.search(search).map(r => r.item));
  });
});

// ================= SINGLE ITEM =================
app.get('/item/:id', (req, res) => {
  db.query(
    "SELECT * FROM items WHERE item_id = ?",
    [req.params.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(results[0]);
    }
  );
});

// ================= PHOTOS =================
app.get("/photos", (req, res) => {
  db.query("SELECT * FROM photo", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const result = rows.map(photo => ({
      ...photo,

      url: cloudinary.url(photo.public_id, {
        secure: true,
        resource_type: "image",
        type: "upload"
      })
    }));

    res.json(result);
  });
});

// ================= PHOTOS BY RALLY =================
app.get("/photos/:rally_id", (req, res) => {
  db.query(
    "SELECT * FROM photo WHERE rally_id = ?",
    [req.params.rally_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const result = rows.map(photo => ({
        ...photo,
        url: cloudinary.url(photo.public_id, {
          secure: true,
          resource_type: "image"
        })
      }));

      res.json(result);
    }
  );
});

// ================= UPLOAD =================
app.post("/upload", auth, creatorOnly, upload.array("media"), (req, res) => {
  const { rally_id, price } = req.body;

  if (!rally_id || !price) {
    return res.status(400).json({ error: "Missing data" });
  }

  const values = req.files.map(f => [
    rally_id,
    req.user.id,
    price,
    f.path,
    f.originalname
  ]);

  db.query(
    "INSERT INTO photo (rally_id, user_id, price, public_id, original_name) VALUES ?",
    [values],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ================= ALL RALLIES =================
app.get("/allRallies", (req, res) => {
  db.query("SELECT * FROM rallies", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ================= LIST PHOTOS (FRONT PAGE) =================
app.get("/list-photos", (req, res) => {
  db.query("SELECT * FROM photo", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const result = rows.map(photo => ({
      id: photo.id,
      rally_id: photo.rally_id,
      price: photo.price,
      public_id: photo.public_id,
      original_name: photo.original_name,

      url: cloudinary.url(photo.public_id, {
        secure: true,
        resource_type: "image"
      })
    }));

    res.json(result);
  });
});

// ================= ME =================
app.get("/me", auth, (req, res) => {
  res.json({
    id: req.user.id,
    creator: req.user.creator,
    admin: req.user.admin
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});