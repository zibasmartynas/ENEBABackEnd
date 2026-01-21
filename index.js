const express = require('express');
const mysql = require('mysql2');
const cors = require('cors')
const Fuse = require('fuse.js');

const app = express();
app.use(cors({origin: "https://eneba-front-end.vercel.app", credentials: true}));
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log("Server running on port ${PORT}");
});