import dotenv from "dotenv";
dotenv.config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Logger middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// JSON body parser
app.use(express.json());

// mongodb

const url = MONGO_URI;
const client = new MongoClient(url);

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("shop");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

connectDB();

// routes

// GET /
app.get("/", (req, res) => {
  res.send(`
    <h1>Products API</h1>
    <ul>
      <li><a href="/api/products">/api/products</a></li>
      <li><a href="/api/products/1">/api/products/:id</a></li>
    </ul>
  `);
});

// GET /api/products
app.get("/api/products", async (req, res) => {
  const filter = {};
  let sortOption = {};
  let projection = {};

  // Filter by category
  if (req.query.category) {
    filter.category = req.query.category;
  }

  // Filter by minimum price
  if (req.query.minPrice) {
    filter.price = { $gte: Number(req.query.minPrice) };
  }

  // Sort by price (ascending)
  if (req.query.sort === "price") {
    sortOption = { price: 1 };
  }

  // Projection (selected fields)
  if (req.query.fields) {
    projection._id = 0;

    const fieldsArray = req.query.fields.split(",");
    fieldsArray.forEach((field) => {
      projection[field] = 1;
    });
  }

  const products = await db
    .collection("products")
    .find(filter, { projection })
    .sort(sortOption)
    .toArray();

  res.json({
    count: products.length,
    products,
  });
});

// GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid product id" });
  }

  const product = await db
    .collection("products")
    .findOne({ _id: new ObjectId(id) });

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  const { name, price, category } = req.body;

  if (!name || !price || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const result = await db.collection("products").insertOne({
    name,
    price,
    category,
  });

  res.status(201).json({
    message: "Product created",
    id: result.insertedId,
  });
});

// 404 handler

app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
