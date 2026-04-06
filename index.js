const express = require('express');
const mysql = require('mysql2');
const cors = require('cors')
const Fuse = require('fuse.js');

const app = express();



const allowedOrigins = [
    "https://eneba-front-end.vercel.app",
    "https://rallyshotfrontend.vercel.app",
    "http://localhost:3000", // for local development
    "http://192.168.1.247:3000"
];


/*app.options("/*", cors({
  origin: allowedOrigins,
  credentials: true
}));*/

app.use(cors({
    origin: function(origin, callback){
        // allow requests with no origin (like Postman or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));

/*app.use(cors({origin: "https://eneba-front-end.vercel.app", credentials: true}));*/
app.use(express.json());
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const JWT_SECRET = "supersecretkey";
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: "deyvgd589", // store in .env
  api_key: "848798133135438",
  api_secret: "TRaeBHUSGzvB3UPZA4heXYYFU5E"
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    resource_type: "auto", // supports images & videos
    type: "private",       // ensures files are private
    format: async (req, file) => "auto",
    public_id: (req, file) => Date.now() + "_" + file.originalname
  }
});

const parser = require("multer")({ storage });

function auth(req, res, next) {
    const header = req.headers.authorization;

    if (!header) return res.sendStatus(401);

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.sendStatus(403);
    }
}

function adminOnly(req, res, next) {
    if (req.user.admin !== 1) {
        return res.sendStatus(403);
    }
    next();
}

function creatorOnly(req, res, next) {
    if (req.user.creator !== 1) {
        return res.sendStatus(403);
    }
    next();
}


const db = mysql.createPool({
    host: 'tramway.proxy.rlwy.net',     // or your MySQL server IP
    port: '17541',
    user: 'root',          // your MySQL username
    password: 'tsfcyHKdvYkyVplEDiZTHRyhQzqyZpTK',          // your MySQL password
    database: 'railway'      // your database name
});

db.getConnection((err, connection) => {
    if (err) {
        console.error("Error connecting to MySQL:", err);
    } else {
        console.log("Connected to MySQL!");
        connection.release(); // release connection back to pool
    }
});

/*app.get('/list', (req, res) => {
    const search = req.query.search || '';


let sql = "SELECT * FROM items";
    const params = [];
    if (search) {
        sql += " WHERE name LIKE ?";
        params.push(`%${search}%`);
    }

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});*/

app.get('/list', (req, res)=>{
    const search = req.query.search || '';

    db.query("SELECT * FROM items", (err, rows) => {
        if(err) return res.status(500).json({error: err.message});

        if(!search) return res.json(rows);

        const fuse = new Fuse(rows, {
            keys: ['item_name'],
            threshold: 0.7,
        });

        const result = fuse.search(search).map(r=>r.item);
        res.json(result);
    })
})

app.get('/item/:id', (req, res) => {
  const { id } = req.params;

  // Use parameterized query to prevent SQL injection
  const sql = "SELECT * FROM items WHERE item_id = ?";

  db.query(sql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(results[0]); // return the single item
  });
});

app.get('/allRallies', (req, res) => {
    const sql = "SELECT * FROM rallies";

    db.query(sql, (err, results)=>{
        if(err){
            return res.status(500).json({error: err.message});
        }

        if(results.length === 0){
            return res.status(404).json({error: "No rallies found"});
        }

        res.json(results);
    });
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    // Check if email already exists
    db.query(
      "SELECT * FROM users WHERE user_email = ?",
      [email],
      async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length > 0) {
          return res.status(400).json({ error: "Email already registered" });
        }

        // Email not found, proceed to insert
        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
          `INSERT INTO users (user_email, user_password, user_creator, user_admin)
           VALUES (?, ?, 0, 0)`,
          [email, hashedPassword],
          (err, result) => {
            if (err) return res.status(500).json({ error: "Database error" });

            res.json({ message: "User registered successfully" });
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE user_email = ?",
        [email],
        async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            if (results.length === 0) {
                return res.status(400).json({ error: "Invalid credentials" });
            }

            const user = results[0];

            const valid = await bcrypt.compare(password, user.user_password);

            if (!valid) {
                return res.status(400).json({ error: "Invalid credentials" });
            }

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

app.get('/admin-data', auth, adminOnly, (req, res) => {
    res.json({ message: "Admin only data" });
});

app.get('/creator-data', auth, creatorOnly, (req, res) => {
    res.json({ message: "Creator only data" });
});

app.get('/me', auth, (req, res) => {
    res.json(req.user);
});

app.get('/users', auth, adminOnly, (req, res) => {
    const sql = "SELECT user_id AS id, user_email AS email, user_creator AS creator, user_admin AS admin FROM users";
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.patch('/users/:id/role', auth, adminOnly, (req, res) => {
    const { id } = req.params;
    const { admin, creator } = req.body; // send { admin: 1 } or { creator: 0 }

    const fields = [];
    const values = [];

    if (admin !== undefined) {
        fields.push("user_admin = ?");
        values.push(admin);
    }
    if (creator !== undefined) {
        fields.push("user_creator = ?");
        values.push(creator);
    }

    if (fields.length === 0) return res.status(400).json({ error: "No role provided" });

    const sql = `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`;
    values.push(id);

    db.query(sql, values, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User role updated" });
    });
});

app.post("/upload", auth, creatorOnly, parser.array("media"), (req, res) => {
  try {
    console.log("UPLOAD HIT");
    console.log("FILES:", req.files);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedFiles = req.files.map(f => ({
      public_id: f.filename || f.public_id,
      url: f.path,
      original_name: f.originalname,
      creator_id: req.user.id
    }));

    return res.json({ uploadedFiles });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/signed-url/:public_id", auth, (req, res) => {
  const { public_id } = req.params;

  try {
    const signedUrl = cloudinary.url(public_id, {
      type: "private",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 5 // 5 min
    });

    res.json({ signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log('Server running on port ${PORT}');
});
