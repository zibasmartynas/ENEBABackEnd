const express = require('express');
const mysql = require('mysql2');
const cors = require('cors')
const Fuse = require('fuse.js');

const app = express();

const allowedOrigins = [
    "https://eneba-front-end.vercel.app",
    "https://rallyshotfrontend.vercel.app",
    "http://localhost:3000" // for local development
];

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log("Server running on port ${PORT}");
});
