import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());

const client = new MongoClient(MONGO_URI);
let db;

function handleServerError(res, err) {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

function validateId(res, id, entityName = "id") {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: `Invalid ${entityName}` });
    return false;
  }
  return true;
}

// API key middleware
function requireApiKey(req, res, next) {
  try {
    const apiKey = req.headers["x-api-key"];
    const expectedKey = process.env.API_KEY;

    // server misconfiguration
    if (!expectedKey) {
      return res.status(500).json({ error: "Server auth is not configured" });
    }

    // missing
    if (!apiKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // wrong
    if (apiKey !== expectedKey) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  } catch (err) {
    return handleServerError(res, err);
  }
}

// Validation for items
function validateItemBody(res, body, { partial = false } = {}) {
  const allowed = ["name", "price", "category", "description"];
  const keys = Object.keys(body);

  if (partial) {
    if (keys.length === 0) {
      res.status(400).json({ error: "PATCH body cannot be empty" });
      return false;
    }
    const invalid = keys.filter((k) => !allowed.includes(k));
    if (invalid.length) {
      res.status(400).json({ error: "Invalid fields", invalid, allowed });
      return false;
    }
  } else {
    const required = ["name", "price", "category"];
    const missing = required.filter(
      (f) => body[f] === undefined || body[f] === null || body[f] === "",
    );
    if (missing.length) {
      res.status(400).json({ error: "Missing required fields", missing });
      return false;
    }
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    res.status(400).json({ error: "Field 'name' must be a string" });
    return false;
  }
  if (body.category !== undefined && typeof body.category !== "string") {
    res.status(400).json({ error: "Field 'category' must be a string" });
    return false;
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    res.status(400).json({ error: "Field 'description' must be a string" });
    return false;
  }
  if (body.price !== undefined) {
    if (
      typeof body.price !== "number" ||
      Number.isNaN(body.price) ||
      body.price < 0
    ) {
      res
        .status(400)
        .json({ error: "Field 'price' must be a non-negative number" });
      return false;
    }
  }

  return true;
}

// routes
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

app.get("/version", (req, res) => {
  res.json({
    version: "1.4",
    updatedAt: "2026-01-30",
  });
});

// PRODUCTS ROUTES
// GET /api/products (supports filter/sort/projection)
app.get("/api/products", async (req, res) => {
  try {
    const filter = {};
    let sortOption = {};
    let projection = {};

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.minPrice) {
      const minPrice = Number(req.query.minPrice);
      if (Number.isNaN(minPrice)) {
        return res.status(400).json({ error: "minPrice must be a number" });
      }
      filter.price = { $gte: minPrice };
    }

    if (req.query.sort === "price") {
      sortOption = { price: 1 };
    }

    if (req.query.fields) {
      projection._id = 0;
      const fieldsArray = String(req.query.fields).split(",");
      fieldsArray.forEach((field) => {
        projection[field] = 1;
      });
    }

    const products = await db
      .collection("products")
      .find(filter, { projection })
      .sort(sortOption)
      .toArray();

    res.status(200).json({ count: products.length, products });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id, "product id")) return;

    const product = await db
      .collection("products")
      .findOne({ _id: new ObjectId(id) });

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.status(200).json(product);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (typeof name !== "string" || typeof category !== "string") {
      return res.status(400).json({ error: "name/category must be strings" });
    }
    if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
      return res
        .status(400)
        .json({ error: "price must be a non-negative number" });
    }

    const result = await db.collection("products").insertOne({
      name,
      price,
      category,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({
      message: "Product created",
      id: result.insertedId,
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// ITEMS ROUTES
// GET /api/items (public)
app.get("/api/items", async (req, res) => {
  try {
    const items = await db.collection("items").find({}).toArray();
    res.status(200).json({ count: items.length, items });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// GET /api/items/:id (public)
app.get("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id, "item id")) return;

    const item = await db
      .collection("items")
      .findOne({ _id: new ObjectId(id) });
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.status(200).json(item);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// POST /api/items (protected)
app.post("/api/items", requireApiKey, async (req, res) => {
  try {
    const { name, price, category, description } = req.body;

    if (
      !validateItemBody(
        res,
        { name, price, category, description },
        { partial: false },
      )
    )
      return;

    const result = await db.collection("items").insertOne({
      name,
      price,
      category,
      description: description ?? "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({ message: "Item created", id: result.insertedId });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// PUT /api/items/:id (protected)
app.put("/api/items/:id", requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id, "item id")) return;

    const { name, price, category, description } = req.body;

    if (
      !validateItemBody(
        res,
        { name, price, category, description },
        { partial: false },
      )
    )
      return;

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name,
          price,
          category,
          description: description ?? "",
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item fully updated" });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// PATCH /api/items/:id (protected)
app.patch("/api/items/:id", requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id, "item id")) return;

    const patchData = req.body;

    if (!validateItemBody(res, patchData, { partial: true })) return;

    patchData.updatedAt = new Date();

    const result = await db
      .collection("items")
      .updateOne({ _id: new ObjectId(id) }, { $set: patchData });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item partially updated" });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// DELETE /api/items/:id (protected)
app.delete("/api/items/:id", requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id, "item id")) return;

    const result = await db
      .collection("items")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // correct REST: 204 No Content
    return res.status(204).send();
  } catch (err) {
    return handleServerError(res, err);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Start server
async function startServer() {
  try {
    await client.connect();
    db = client.db("shop");
    console.log("Connected to MongoDB (db: shop)");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

startServer();
